<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\Client;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Produit;
use App\Models\Promotion;
use App\Models\User;
use App\Models\Variante;
use App\Models\Vente;
use Illuminate\Support\Facades\DB;

/**
 * Reproduit côté serveur les actions `validerVente` et `annulerVente` de
 * src/store.tsx (Phase 1). Toute la logique de calcul (remise, marge) doit
 * rester identique des deux côtés : voir src/lib/calc.ts pour la référence.
 */
class VenteService
{
    /**
     * @param  array  $cart  [['variante_id' => int, 'unite' => 'pagne'|'yard'|'metre', 'quantite' => float, 'remise_type' => 'pct'|'fcfa', 'remise_valeur' => float], ...]
     * @param  array  $paiement  ['mode' => string, 'reference' => ?string, 'recu' => ?int]
     * @param  int  $pointsUtilises  points de fidélité du client échangés contre une remise
     */
    public function valider(User $vendeur, array $cart, ?int $clientId, string $remiseType, float $remiseValeur, array $paiement, int $pointsUtilises = 0): Vente
    {
        if (count($cart) === 0) {
            throw new RegleMetierException('Le panier est vide.');
        }
        foreach ($cart as $l) {
            if (($l['quantite'] ?? 0) <= 0) {
                throw new RegleMetierException('Indiquez une quantité valide.');
            }
        }

        // Un solde inactif depuis trop longtemps est perdu avant tout usage. Transaction à part :
        // l'expiration reste enregistrée même si la vente est ensuite refusée.
        if ($clientId !== null) {
            DB::transaction(function () use ($vendeur, $clientId) {
                $client = Client::query()->forCurrentContext($vendeur)->whereKey($clientId)->lockForUpdate()->first();
                if ($client) {
                    app(FideliteService::class)->expirerSiInactif($client, Parametre::actuel($vendeur));
                }
            });
        }

        return DB::transaction(function () use ($vendeur, $cart, $clientId, $remiseType, $remiseValeur, $paiement, $pointsUtilises) {
            // Verrou d'exclusion sur la ligne unique des paramètres : sérialise les ventes pour que
            // deux caisses n'obtiennent jamais le même numéro. Ordre fixe des verrous pour éviter les
            // interblocages : paramètres, puis client, puis stock (annuler() suit le même ordre).
            $parametres = Parametre::actuel($vendeur);
            $parametres = Parametre::query()->forCurrentTenant($vendeur)->forCurrentBoutique($vendeur)->whereKey($parametres->id)->lockForUpdate()->first();

            // Client verrouillé : son solde de points ne peut pas être dépensé deux fois en même temps.
            $client = null;
            if ($clientId !== null) {
                $client = Client::query()->forCurrentContext($vendeur)->whereKey($clientId)->lockForUpdate()->first();
                if (! $client) {
                    throw new RegleMetierException('Client introuvable dans cette boutique.');
                }
            }
            if ($pointsUtilises > 0) {
                if (! $parametres->fidelite_active) {
                    throw new RegleMetierException('Le programme de fidélité n’est pas activé dans cette boutique.');
                }
                if (! $client) {
                    throw new RegleMetierException('Choisissez le client dont les points sont utilisés.');
                }
                if ($pointsUtilises < $parametres->fidelite_seuil) {
                    throw new RegleMetierException('Il faut utiliser au moins :n points.', ['n' => $parametres->fidelite_seuil]);
                }
                if ($pointsUtilises > $client->points) {
                    throw new RegleMetierException('Solde insuffisant : :nom n’a que :n points.', ['nom' => $client->nom, 'n' => max(0, $client->points)]);
                }
            }

            // Verrouille les lignes de stock concernées pour éviter que deux caisses
            // ne vendent en même temps le dernier mètre du même coloris.
            $variantes = Variante::with('produit')->whereIn('id', array_column($cart, 'variante_id'))
                ->where('tenant_id', $vendeur->tenant_id)
                ->where('boutique_id', $vendeur->boutique_id)
                ->lockForUpdate()->get()->keyBy('id');

            $uniteStock = $parametres->unite_stock;
            $lignes = [];
            $besoins = []; // variante_id => quantité cumulée à décrémenter, dans l'unité de stock de la boutique
            $brutTotal = 0;
            $sousTotal = 0;
            $coutTotal = 0;

            foreach ($cart as $l) {
                $variante = $variantes->get($l['variante_id']);
                if (! $variante) {
                    throw new RegleMetierException('Article introuvable.');
                }
                $produit = $variante->produit;
                $unite = $l['unite'];
                $libelle = Produit::libelleUnite($unite);
                if (! $parametres->autorise($unite)) {
                    throw new RegleMetierException('La vente au :unite n’est pas autorisée dans cette boutique.', ['unite' => $libelle]);
                }
                if (! $produit->vendAu($unite)) {
                    throw new RegleMetierException('« :produit » ne se vend pas au :unite.', ['produit' => $produit->nom, 'unite' => $libelle]);
                }
                $prixUnitaire = $produit->prixPour($unite);
                $brut = (int) round($l['quantite'] * $prixUnitaire);
                $yards = $produit->yardsPour($unite, (float) $l['quantite']);
                $quantiteStock = $produit->quantitePour($unite, (float) $l['quantite'], $uniteStock);
                $cout = $produit->coutPourYards($yards);

                $besoins[$variante->id] = ($besoins[$variante->id] ?? 0) + $quantiteStock;
                $coutTotal += $cout;

                $lignes[] = compact('variante', 'produit', 'unite', 'yards', 'quantiteStock', 'prixUnitaire', 'brut', 'cout', 'l');
            }

            // Promotion d'abord (la plus avantageuse par ligne), puis la remise manuelle sur ce qui reste.
            $promos = $this->meilleuresPromotions($vendeur, $lignes);
            $promoTotal = 0;
            foreach ($lignes as $i => &$x) {
                $promo = $promos[$i] ?? null;
                $x['promotion'] = $promo['promotion'] ?? null;
                $x['remisePromo'] = $promo['montant'] ?? 0;
                $base = $x['brut'] - $x['remisePromo'];
                $x['total'] = $base - $this->montantRemise($base, $x['l']['remise_type'] ?? 'pct', $x['l']['remise_valeur'] ?? 0);
                $brutTotal += $x['brut'];
                $promoTotal += $x['remisePromo'];
                $sousTotal += $x['total'];
            }
            unset($x);

            // Toutes les lignes sont forcément au pagne ici : la somme des quantités a un sens.
            if ($parametres->vendUniquementAuPagne()) {
                $quantiteTotale = array_sum(array_map(fn ($l) => (float) $l['quantite'], $cart));
                if ($quantiteTotale + 0.001 < $parametres->quantite_min_panier) {
                    throw new RegleMetierException('Quantité minimale par vente : :n pagne(s).', [
                        'n' => rtrim(rtrim(number_format($parametres->quantite_min_panier, 2, ',', ''), '0'), ','),
                    ]);
                }
            }

            foreach ($besoins as $varianteId => $quantite) {
                $variante = $variantes->get($varianteId);
                if (round($quantite, 2) > (float) $variante->stock) {
                    throw new RegleMetierException('Stock insuffisant pour :produit — :coloris : :stock :unite(s) disponible(s).', [
                        'produit' => $variante->produit->nom, 'coloris' => $variante->coloris, 'stock' => $variante->stock, 'unite' => Produit::libelleUnite($uniteStock),
                    ]);
                }
            }

            $remiseGlobale = $this->montantRemise($sousTotal, $remiseType, $remiseValeur);
            $total = $sousTotal - $remiseGlobale;
            // Remise effective (lignes + globale), comme lib/calc.ts::totaux : une remise de ligne compte
            // dans le plafond accordé aux vendeurs, pas une promotion, décidée par l'administrateur.
            $basePlafond = $brutTotal - $promoTotal;
            $remiseEffPct = $basePlafond > 0 ? (($basePlafond - $total) / $basePlafond) * 100 : 0;

            if (! $vendeur->estAdmin() && $remiseEffPct > $parametres->remise_max_vendeur + 0.001) {
                throw new RegleMetierException('Remise trop élevée : au-delà de :max %, un administrateur est requis.', ['max' => $parametres->remise_max_vendeur]);
            }

            // Points de fidélité : un droit du client, hors plafond vendeur, déduit après toutes les remises.
            $remisePoints = $parametres->remisePourPoints($pointsUtilises);
            if ($remisePoints > $total) {
                throw new RegleMetierException('Trop de points pour ce ticket : au plus :n points.', [
                    'n' => $parametres->fidelite_valeur_point > 0 ? intdiv($total, $parametres->fidelite_valeur_point) : 0,
                ]);
            }
            $total -= $remisePoints;
            $pointsGagnes = $client ? $parametres->pointsGagnes($total) : 0;

            $mode = $paiement['mode'];
            if (in_array($mode, ['flooz', 'tmoney'], true) && empty(trim($paiement['reference'] ?? ''))) {
                throw new RegleMetierException('La référence de la transaction est obligatoire pour le mobile money.');
            }
            $recu = $paiement['recu'] ?? null;
            if ($mode === 'especes' && $recu && $recu > 0 && $recu < $total) {
                throw new RegleMetierException('Le montant reçu est inférieur au total.');
            }

            $numero = (int) (Vente::where('tenant_id', $vendeur->tenant_id)->where('boutique_id', $vendeur->boutique_id)->max('numero') ?? 0) + 1;

            $vente = Vente::create([
                'tenant_id' => $vendeur->tenant_id,
                'boutique_id' => $vendeur->boutique_id,
                'numero' => $numero,
                'vendeur_id' => $vendeur->id,
                'client_id' => $clientId,
                'sous_total' => $sousTotal,
                'remise_type' => $remiseType,
                'remise_valeur' => $remiseValeur,
                'remise_montant' => $remiseGlobale,
                'points_utilises' => $pointsUtilises,
                'remise_points' => $remisePoints,
                'points_gagnes' => $pointsGagnes,
                'total' => $total,
                'marge' => $total - $coutTotal,
                'paiement_mode' => $mode,
                'paiement_reference' => $mode === 'flooz' || $mode === 'tmoney' ? trim($paiement['reference']) : null,
                'paiement_recu' => $mode === 'especes' && $recu > 0 ? $recu : null,
                'statut' => 'validee',
            ]);

            // Remise globale et remise en points sont réparties sur les lignes : `net` est ce qui a été encaissé pour chacune.
            $nets = self::repartirRemise(array_column($lignes, 'total'), $remiseGlobale + $remisePoints);
            foreach ($lignes as $i => $x) {
                LigneVente::create([
                    'tenant_id' => $vendeur->tenant_id,
                    'boutique_id' => $vendeur->boutique_id,
                    'vente_id' => $vente->id,
                    'variante_id' => $x['variante']->id,
                    'produit_id' => $x['produit']->id,
                    'proprietaire_id' => $x['produit']->proprietaire_id,
                    'libelle' => $x['produit']->nom,
                    'coloris' => $x['variante']->coloris,
                    'unite' => $x['unite'],
                    'quantite' => $x['l']['quantite'],
                    'yards' => $x['yards'],
                    'quantite_stock' => $x['quantiteStock'],
                    'prix_unitaire' => $x['prixUnitaire'],
                    'brut' => $x['brut'],
                    'remise_type' => $x['l']['remise_type'] ?? 'pct',
                    'remise_valeur' => $x['l']['remise_valeur'] ?? 0,
                    'promotion_id' => $x['promotion']?->id,
                    'promotion_libelle' => $x['promotion']?->nom,
                    'remise_promo' => $x['remisePromo'],
                    'total' => $x['total'],
                    'net' => $nets[$i],
                    'cout' => $x['cout'],
                ]);
                Mouvement::create([
                    'tenant_id' => $vendeur->tenant_id,
                    'boutique_id' => $vendeur->boutique_id,
                    'variante_id' => $x['variante']->id, 'type' => 'vente', 'quantite' => -$x['quantiteStock'],
                    'user_id' => $vendeur->id, 'motif' => 'Vente '.$vente->numeroAffiche(), 'vente_id' => $vente->id,
                ]);
            }

            foreach ($besoins as $varianteId => $quantite) {
                $variantes->get($varianteId)->decrement('stock', $quantite);
            }

            if ($client) {
                $fidelite = app(FideliteService::class);
                $fidelite->mouvement($client, 'utilisation', -$pointsUtilises, $vente, $vendeur, 'Remise sur '.$vente->numeroAffiche());
                $fidelite->mouvement($client, 'gain', $pointsGagnes, $vente, $vendeur, 'Achat '.$vente->numeroAffiche());
            }

            return $vente->load('lignes', 'client', 'vendeur:id,nom');
        });
    }

    public function annuler(Vente $vente, User $utilisateur, string $motif): Vente
    {
        if (! $vente->belongsToCurrentContext($utilisateur)) {
            throw new RegleMetierException('Cette vente n’appartient pas à cette boutique.');
        }

        if (trim($motif) === '') {
            throw new RegleMetierException('Le motif est obligatoire.');
        }

        return DB::transaction(function () use ($vente, $utilisateur, $motif) {
            // Relit la vente sous verrou : deux annulations simultanées ne peuvent plus
            // restaurer le stock deux fois.
            $vente = Vente::lockForUpdate()->findOrFail($vente->id);
            if ($vente->statut === 'annulee') {
                throw new RegleMetierException('Cette vente est déjà annulée.');
            }

            // Même ordre de verrous que valider() : client avant stock.
            $client = $vente->client_id && ($vente->points_gagnes || $vente->points_utilises)
                ? Client::whereKey($vente->client_id)->lockForUpdate()->first()
                : null;

            $vente->load('lignes');
            $variantes = Variante::whereIn('id', $vente->lignes->pluck('variante_id'))
                ->where('tenant_id', $vente->tenant_id)
                ->where('boutique_id', $vente->boutique_id)
                ->lockForUpdate()->get()->keyBy('id');

            // On restaure la quantité gelée à la vente (unité de stock d'alors), jamais `yards`
            // qui n'est qu'un pivot de calcul du coût.
            foreach ($vente->lignes as $ligne) {
                $variantes->get($ligne->variante_id)->increment('stock', $ligne->quantite_stock);
                Mouvement::create([
                    'tenant_id' => $vente->tenant_id,
                    'boutique_id' => $vente->boutique_id,
                    'variante_id' => $ligne->variante_id, 'type' => 'annulation', 'quantite' => $ligne->quantite_stock,
                    'user_id' => $utilisateur->id, 'motif' => 'Annulation '.$vente->numeroAffiche(), 'vente_id' => $vente->id,
                ]);
            }

            // Les points gagnés sont retirés (le solde peut devenir négatif s'ils ont déjà été dépensés),
            // les points utilisés sont rendus.
            if ($client) {
                $fidelite = app(FideliteService::class);
                $fidelite->mouvement($client, 'annulation', (int) $vente->points_utilises, $vente, $utilisateur, 'Points rendus — annulation '.$vente->numeroAffiche());
                $fidelite->mouvement($client, 'annulation', -(int) $vente->points_gagnes, $vente, $utilisateur, 'Points retirés — annulation '.$vente->numeroAffiche());
            }

            $vente->update([
                'statut' => 'annulee', 'annulation_date' => now(),
                'annulation_user_id' => $utilisateur->id, 'annulation_motif' => trim($motif),
            ]);

            return $vente;
        });
    }

    /**
     * Pour chaque ligne, la promotion en cours qui lui retire le plus. Le seuil de quantité
     * d'une promotion se compte sur toutes les lignes qu'elle vise (même unité, imposée à la
     * création). Miroir de lib/calc.ts::meilleuresPromotions.
     *
     * @return array<int, array{promotion: Promotion, montant: int}>
     */
    private function meilleuresPromotions(User $vendeur, array $lignes): array
    {
        $choix = [];
        foreach (Promotion::query()->forCurrentContext($vendeur)->enCours()->orderBy('id')->get() as $promo) {
            $visees = array_filter($lignes, fn ($x) => $promo->vise($x['produit'], $x['variante'], $x['unite']));
            if (! $visees) {
                continue;
            }
            $quantite = array_sum(array_map(fn ($x) => (float) $x['l']['quantite'], $visees));
            if ($quantite + 0.001 < $promo->quantite_min) {
                continue;
            }
            foreach ($visees as $i => $x) {
                $montant = $promo->montantPour($x['brut'], (float) $x['l']['quantite']);
                if ($montant > ($choix[$i]['montant'] ?? 0)) {
                    $choix[$i] = ['promotion' => $promo, 'montant' => $montant];
                }
            }
        }

        return $choix;
    }

    /**
     * Répartit la remise globale du ticket sur ses lignes, au prorata de leur total, en
     * entiers FCFA dont la somme vaut exactement la remise (méthode du plus fort reste).
     * Renvoie le net de chaque ligne, avec les mêmes clés que $totaux.
     *
     * @param  array<int|string, int>  $totaux
     * @return array<int|string, int>
     */
    public static function repartirRemise(array $totaux, int $remise): array
    {
        $base = array_sum($totaux);
        if ($remise <= 0 || $base <= 0) {
            return $totaux;
        }
        $parts = [];
        $restes = [];
        foreach ($totaux as $cle => $total) {
            $exact = $remise * $total / $base;
            $parts[$cle] = (int) floor($exact);
            $restes[$cle] = $exact - $parts[$cle];
        }
        arsort($restes);
        foreach (array_slice(array_keys($restes), 0, $remise - array_sum($parts), true) as $cle) {
            $parts[$cle]++;
        }
        $nets = [];
        foreach ($totaux as $cle => $total) {
            $nets[$cle] = $total - $parts[$cle];
        }

        return $nets;
    }

    /** Montant d'une remise appliquée à une base (entier FCFA, jamais supérieur à la base). Voir lib/calc.ts::remiseMontant. */
    private function montantRemise(int $base, string $type, float $valeur): int
    {
        $v = max(0, $valeur);
        $montant = $type === 'pct' ? round(($base * min($v, 100)) / 100) : round($v);

        return (int) min($base, $montant);
    }
}
