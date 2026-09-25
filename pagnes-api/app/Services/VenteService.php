<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Parametre;
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
     * @param array $cart [['variante_id' => int, 'unite' => 'pagne'|'yard', 'quantite' => float, 'remise_type' => 'pct'|'fcfa', 'remise_valeur' => float], ...]
     * @param array $paiement ['mode' => string, 'reference' => ?string, 'recu' => ?int]
     */
    public function valider(User $vendeur, array $cart, ?int $clientId, string $remiseType, float $remiseValeur, array $paiement): Vente
    {
        if (count($cart) === 0) {
            throw new RegleMetierException('Le panier est vide.');
        }
        foreach ($cart as $l) {
            if (($l['quantite'] ?? 0) <= 0) {
                throw new RegleMetierException('Indiquez une quantité valide.');
            }
        }

        return DB::transaction(function () use ($vendeur, $cart, $clientId, $remiseType, $remiseValeur, $paiement) {
            // Verrou d'exclusion sur la ligne unique des paramètres : sérialise les ventes pour que
            // deux caisses n'obtiennent jamais le même numéro. Toujours pris AVANT les verrous de
            // stock (ordre fixe) pour éviter les interblocages.
            $parametres = Parametre::actuel();
            $parametres = Parametre::whereKey($parametres->id)->lockForUpdate()->first();

            // Verrouille les lignes de stock concernées pour éviter que deux caisses
            // ne vendent en même temps le dernier mètre du même coloris.
            $variantes = Variante::with('produit')->whereIn('id', array_column($cart, 'variante_id'))
                ->lockForUpdate()->get()->keyBy('id');

            $lignes = [];
            $besoins = []; // variante_id => yards cumulés à décrémenter
            $brutTotal = 0;
            $sousTotal = 0;
            $coutTotal = 0;

            foreach ($cart as $l) {
                $variante = $variantes->get($l['variante_id']);
                if (!$variante) {
                    throw new RegleMetierException('Article introuvable.');
                }
                $produit = $variante->produit;
                $unite = $l['unite'];
                if (!in_array($unite, ['pagne', 'yard'], true)
                    || ($unite === 'pagne' && !$produit->vend_pagne)
                    || ($unite === 'yard' && !$produit->vend_yard)) {
                    throw new RegleMetierException(sprintf('« %s » ne se vend pas au %s.', $produit->nom, $unite));
                }
                $prixUnitaire = $unite === 'pagne' ? $produit->prix_pagne : $produit->prix_yard;
                $brut = (int) round($l['quantite'] * $prixUnitaire);
                $remiseLigne = $this->montantRemise($brut, $l['remise_type'] ?? 'pct', $l['remise_valeur'] ?? 0);
                $total = $brut - $remiseLigne;
                $yards = $produit->yardsPour($unite, (float) $l['quantite']);
                $cout = $produit->coutPourYards($yards);

                $besoins[$variante->id] = ($besoins[$variante->id] ?? 0) + $yards;
                $brutTotal += $brut;
                $sousTotal += $total;
                $coutTotal += $cout;

                $lignes[] = compact('variante', 'produit', 'unite', 'yards', 'prixUnitaire', 'brut', 'total', 'cout', 'l');
            }

            foreach ($besoins as $varianteId => $yards) {
                $variante = $variantes->get($varianteId);
                if (round($yards, 2) > (float) $variante->stock) {
                    throw new RegleMetierException(sprintf(
                        'Stock insuffisant pour %s — %s : %s yards disponibles.',
                        $variante->produit->nom, $variante->coloris, $variante->stock
                    ));
                }
            }

            $remiseGlobale = $this->montantRemise($sousTotal, $remiseType, $remiseValeur);
            $total = $sousTotal - $remiseGlobale;
            // Remise effective sur le BRUT (lignes + globale), comme lib/calc.ts::totaux :
            // une remise de ligne compte aussi dans le plafond accordé aux vendeurs.
            $remiseEffPct = $brutTotal > 0 ? (($brutTotal - $total) / $brutTotal) * 100 : 0;

            if (!$vendeur->estAdmin() && $remiseEffPct > $parametres->remise_max_vendeur + 0.001) {
                throw new RegleMetierException(sprintf(
                    'Remise trop élevée : au-delà de %d %%, un administrateur est requis.',
                    $parametres->remise_max_vendeur
                ));
            }

            $mode = $paiement['mode'];
            if (in_array($mode, ['flooz', 'tmoney'], true) && empty(trim($paiement['reference'] ?? ''))) {
                throw new RegleMetierException('La référence de la transaction est obligatoire pour le mobile money.');
            }
            $recu = $paiement['recu'] ?? null;
            if ($mode === 'especes' && $recu && $recu > 0 && $recu < $total) {
                throw new RegleMetierException('Le montant reçu est inférieur au total.');
            }

            $numero = (int) (Vente::max('numero') ?? 0) + 1;

            $vente = Vente::create([
                'numero' => $numero,
                'vendeur_id' => $vendeur->id,
                'client_id' => $clientId,
                'sous_total' => $sousTotal,
                'remise_type' => $remiseType,
                'remise_valeur' => $remiseValeur,
                'remise_montant' => $remiseGlobale,
                'total' => $total,
                'marge' => $total - $coutTotal,
                'paiement_mode' => $mode,
                'paiement_reference' => $mode === 'flooz' || $mode === 'tmoney' ? trim($paiement['reference']) : null,
                'paiement_recu' => $mode === 'especes' && $recu > 0 ? $recu : null,
                'statut' => 'validee',
            ]);

            foreach ($lignes as $x) {
                LigneVente::create([
                    'vente_id' => $vente->id,
                    'variante_id' => $x['variante']->id,
                    'produit_id' => $x['produit']->id,
                    'libelle' => $x['produit']->nom,
                    'coloris' => $x['variante']->coloris,
                    'unite' => $x['unite'],
                    'quantite' => $x['l']['quantite'],
                    'yards' => $x['yards'],
                    'prix_unitaire' => $x['prixUnitaire'],
                    'brut' => $x['brut'],
                    'remise_type' => $x['l']['remise_type'] ?? 'pct',
                    'remise_valeur' => $x['l']['remise_valeur'] ?? 0,
                    'total' => $x['total'],
                    'cout' => $x['cout'],
                ]);
                Mouvement::create([
                    'variante_id' => $x['variante']->id, 'type' => 'vente', 'yards' => -$x['yards'],
                    'user_id' => $vendeur->id, 'motif' => 'Vente ' . $vente->numeroAffiche(), 'vente_id' => $vente->id,
                ]);
            }

            foreach ($besoins as $varianteId => $yards) {
                $variantes->get($varianteId)->decrement('stock', $yards);
            }

            return $vente->load('lignes', 'client', 'vendeur');
        });
    }

    public function annuler(Vente $vente, User $utilisateur, string $motif): Vente
    {
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

            $vente->load('lignes');
            $variantes = Variante::whereIn('id', $vente->lignes->pluck('variante_id'))->lockForUpdate()->get()->keyBy('id');

            foreach ($vente->lignes as $ligne) {
                $variantes->get($ligne->variante_id)->increment('stock', $ligne->yards);
                Mouvement::create([
                    'variante_id' => $ligne->variante_id, 'type' => 'annulation', 'yards' => $ligne->yards,
                    'user_id' => $utilisateur->id, 'motif' => 'Annulation ' . $vente->numeroAffiche(), 'vente_id' => $vente->id,
                ]);
            }

            $vente->update([
                'statut' => 'annulee', 'annulation_date' => now(),
                'annulation_user_id' => $utilisateur->id, 'annulation_motif' => trim($motif),
            ]);

            return $vente;
        });
    }

    /** Montant d'une remise appliquée à une base (entier FCFA, jamais supérieur à la base). Voir lib/calc.ts::remiseMontant. */
    private function montantRemise(int $base, string $type, float $valeur): int
    {
        $v = max(0, $valeur);
        $montant = $type === 'pct' ? round(($base * min($v, 100)) / 100) : round($v);
        return (int) min($base, $montant);
    }
}
