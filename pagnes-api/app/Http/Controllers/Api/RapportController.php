<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Produit;
use App\Models\Variante;
use App\Models\Vente;
use App\Support\Csv;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Rapports et exports de la boutique (administrateur), sur une période `?du=&au=` (par défaut le mois en cours).
 * Les ventes comptées sont les ventes validées ; les annulées sont seulement dénombrées. Jours au fuseau APP_TIMEZONE.
 */
class RapportController extends Controller
{
    /** Synthèse des ventes de la période : totaux, par jour, par moyen de paiement, par vendeur, meilleurs produits. */
    public function ventes(Request $request)
    {
        [$du, $au] = $this->periode($request);
        $user = $request->user();
        $validees = fn (): Builder => Vente::query()->forCurrentContext($user)->where('ventes.statut', 'validee')
            ->whereBetween('ventes.created_at', [$du, $au]);

        $t = $validees()->selectRaw('COUNT(*) as ventes, COALESCE(SUM(total), 0) as ca, COALESCE(SUM(marge), 0) as marge, COALESCE(SUM(remise_points), 0) as points,
            SUM(CASE WHEN hors_ligne THEN 1 ELSE 0 END) as hors_ligne, SUM(CASE WHEN anomalies IS NOT NULL THEN 1 ELSE 0 END) as anomalies')->first();
        $lignes = LigneVente::query()->forCurrentContext($user)->join('ventes', 'ventes.id', '=', 'lignes_vente.vente_id')
            ->where('ventes.statut', 'validee')->whereBetween('ventes.created_at', [$du, $au]);
        $brut = (int) (clone $lignes)->sum('lignes_vente.brut');
        $ca = (int) $t->ca;
        $ventes = (int) $t->ventes;

        return [
            'du' => $du->toDateString(), 'au' => $au->toDateString(),
            'totaux' => [
                'ventes' => $ventes, 'ca' => $ca, 'marge' => (int) $t->marge,
                'panier_moyen' => $ventes > 0 ? intdiv($ca, $ventes) : 0,
                // Tout ce qui a été retiré du prix affiché : promotions, remises de ligne et du ticket, points.
                'remises' => max(0, $brut - $ca), 'remise_points' => (int) $t->points,
                'annulees' => Vente::query()->forCurrentContext($user)->where('statut', 'annulee')->whereBetween('created_at', [$du, $au])->count(),
                'hors_ligne' => (int) $t->hors_ligne, 'anomalies' => (int) $t->anomalies,
            ],
            'par_jour' => $validees()->selectRaw('DATE(created_at) as jour, COUNT(*) as ventes, SUM(total) as ca, SUM(marge) as marge')
                ->groupBy('jour')->orderBy('jour')->get()
                ->map(fn ($r) => ['date' => (string) $r->jour, 'ventes' => (int) $r->ventes, 'ca' => (int) $r->ca, 'marge' => (int) $r->marge]),
            'par_paiement' => $validees()->selectRaw('paiement_mode as mode, COUNT(*) as ventes, SUM(total) as ca')
                ->groupBy('paiement_mode')->orderByDesc('ca')->get()
                ->map(fn ($r) => ['mode' => $r->mode, 'ventes' => (int) $r->ventes, 'ca' => (int) $r->ca]),
            'par_vendeur' => $validees()->join('users', 'users.id', '=', 'ventes.vendeur_id')
                ->selectRaw('ventes.vendeur_id, users.nom, COUNT(*) as ventes, SUM(ventes.total) as ca, SUM(ventes.marge) as marge')
                ->groupBy('ventes.vendeur_id', 'users.nom')->orderByDesc('ca')->get()
                ->map(fn ($r) => ['vendeur_id' => $r->vendeur_id, 'nom' => $r->nom, 'ventes' => (int) $r->ventes, 'ca' => (int) $r->ca, 'marge' => (int) $r->marge]),
            // Net encaissé par produit (remise du ticket et points répartis sur les lignes) et sa marge.
            'par_produit' => (clone $lignes)
                ->selectRaw('lignes_vente.produit_id, MAX(lignes_vente.libelle) as libelle, COUNT(DISTINCT lignes_vente.vente_id) as ventes,
                    SUM(lignes_vente.quantite_stock) as quantite, SUM(lignes_vente.net) as ca, SUM(lignes_vente.net - lignes_vente.cout) as marge')
                ->groupBy('lignes_vente.produit_id')->orderByDesc('ca')->limit(20)->get()
                ->map(fn ($r) => ['produit_id' => $r->produit_id, 'libelle' => $r->libelle, 'ventes' => (int) $r->ventes,
                    'quantite' => round((float) $r->quantite, 2), 'ca' => (int) $r->ca, 'marge' => (int) $r->marge]),
            'unite_stock' => Parametre::actuel($user)->unite_stock,
        ];
    }

    /** Une ligne par vente (validées et annulées) de la période. */
    public function exportVentes(Request $request)
    {
        [$du, $au] = $this->periode($request);
        $q = Vente::query()->forCurrentContext($request->user())->whereBetween('created_at', [$du, $au])
            ->with('vendeur:id,nom', 'client:id,nom')->withCount('lignes')->orderBy('created_at')->orderBy('id');

        return Csv::telecharger($this->nom('ventes', $du, $au), [
            __('Numéro'), __('Date'), __('Vendeur'), __('Client'), __('Statut'), __('Articles'), __('Sous-total'), __('Remise'),
            __('Remise points'), __('Total'), __('Marge'), __('Paiement'), __('Référence'), __('Hors ligne'), __('Anomalies'),
        ], (function () use ($q) {
            foreach ($q->lazy(500) as $v) {
                yield [
                    $v->numeroAffiche(), $this->date($v->created_at), $v->vendeur?->nom, $v->client?->nom,
                    $v->statut === 'validee' ? __('Validée') : __('Annulée'), $v->lignes_count, (int) $v->sous_total,
                    (int) $v->remise_montant, (int) $v->remise_points, (int) $v->total, (int) $v->marge, $this->modePaiement($v->paiement_mode),
                    $v->paiement_reference, (bool) $v->hors_ligne, $v->anomalies ? count($v->anomalies) : 0,
                ];
            }
        })());
    }

    /** Une ligne par article vendu : produit, coloris, propriétaire, quantités, prix, remises, net encaissé, coût, marge. */
    public function exportLignes(Request $request)
    {
        [$du, $au] = $this->periode($request);
        $q = LigneVente::query()->forCurrentContext($request->user())
            ->join('ventes', 'ventes.id', '=', 'lignes_vente.vente_id')
            ->leftJoin('proprietaires', 'proprietaires.id', '=', 'lignes_vente.proprietaire_id')
            ->whereBetween('ventes.created_at', [$du, $au])
            ->select('lignes_vente.*', 'ventes.numero', 'ventes.created_at as vendue_le', 'ventes.statut', 'proprietaires.nom as proprietaire')
            ->orderBy('ventes.created_at')->orderBy('lignes_vente.id');

        return Csv::telecharger($this->nom('lignes-de-vente', $du, $au), [
            __('Numéro'), __('Date'), __('Statut'), __('Produit'), __('Coloris'), __('Propriétaire'), __('Unité'), __('Quantité'),
            __('Prix unitaire'), __('Brut'), __('Promotion'), __('Remise promotion'), __('Total ligne'), __('Net encaissé'), __('Coût'), __('Marge'),
        ], (function () use ($q) {
            foreach ($q->lazyById(500, 'lignes_vente.id', 'id') as $l) {
                yield [
                    'V-'.str_pad((string) $l->numero, 5, '0', STR_PAD_LEFT), $this->date(Carbon::parse($l->vendue_le)),
                    $l->statut === 'validee' ? __('Validée') : __('Annulée'), $l->libelle, $l->coloris, $l->proprietaire,
                    Produit::libelleUnite($l->unite), (float) $l->quantite, (int) $l->prix_unitaire, (int) $l->brut,
                    $l->promotion_libelle, (int) $l->remise_promo, (int) $l->total, (int) $l->net, (int) $l->cout, (int) $l->net - (int) $l->cout,
                ];
            }
        })());
    }

    /** Mouvements de stock de la période (entrées, ventes, annulations, ajustements). */
    public function exportMouvements(Request $request)
    {
        [$du, $au] = $this->periode($request);
        $user = $request->user();
        $unite = Produit::libelleUnite(Parametre::actuel($user)->unite_stock);
        $q = Mouvement::query()->forCurrentContext($user)->whereBetween('created_at', [$du, $au])
            ->with('utilisateur:id,nom', 'variante:id,produit_id,coloris', 'variante.produit:id,nom', 'vente:id,numero')
            ->orderBy('created_at')->orderBy('id');

        return Csv::telecharger($this->nom('mouvements', $du, $au), [
            __('Date'), __('Type'), __('Produit'), __('Coloris'), __('Quantité'), __('Unité'), __('Utilisateur'), __('Motif'),
            __('Fournisseur'), __('Prix d’achat (pagne)'), __('Vente'),
        ], (function () use ($q, $unite) {
            foreach ($q->lazy(500) as $m) {
                yield [
                    $this->date($m->created_at), $this->typeMouvement($m->type), $m->variante?->produit?->nom, $m->variante?->coloris,
                    (float) $m->quantite, $unite, $m->utilisateur?->nom, $m->motif, $m->fournisseur,
                    $m->prix_achat_pagne !== null ? (int) $m->prix_achat_pagne : null, $m->vente?->numeroAffiche(),
                ];
            }
        })());
    }

    /** Stock actuel, coloris par coloris, avec sa valeur au prix d'achat. */
    public function exportStock(Request $request)
    {
        $user = $request->user();
        $uniteStock = Parametre::actuel($user)->unite_stock;
        $q = Variante::query()->forCurrentContext($user)->with('produit', 'produit.proprietaire:id,nom')
            ->join('produits', 'produits.id', '=', 'variantes.produit_id')
            ->select('variantes.*')->orderBy('produits.nom')->orderBy('variantes.coloris');

        return Csv::telecharger('stock-'.now()->format('Y-m-d').'.csv', [
            __('Produit'), __('Type'), __('Motif'), __('Coloris'), __('SKU'), __('Propriétaire'), __('Stock'), __('Unité'),
            __('Seuil d’alerte'), __('État'), __('Prix de vente (pagne)'), __('Prix d’achat (pagne)'), __('Valeur d’achat'),
        ], (function () use ($q, $uniteStock) {
            foreach ($q->lazyById(500, 'variantes.id', 'id') as $v) {
                $p = $v->produit;
                $stock = (float) $v->stock;
                yield [
                    $p->nom, $p->type, $p->motif, $v->coloris, $v->sku, $p->proprietaire?->nom, $stock, Produit::libelleUnite($uniteStock),
                    (float) $v->seuil, $stock <= 0 ? __('Rupture') : ($stock <= (float) $v->seuil ? __('Stock bas') : __('En stock')),
                    (int) $p->prix_pagne, (int) $p->prix_achat_pagne, $p->coutPourYards($p->yardsPour($uniteStock, $stock)),
                ];
            }
        })());
    }

    /** Rapport propriétaires de la période (même calcul que GET /api/rapports/proprietaires). */
    public function exportProprietaires(Request $request, ProprietaireController $proprietaires)
    {
        [$du, $au] = $this->periode($request);
        $r = $proprietaires->rapport($request);

        return Csv::telecharger($this->nom('proprietaires', $du, $au), [
            __('Propriétaire'), __('Tickets'), __('Net encaissé'), __('Coût'), __('Marge'), __('Quantité vendue'),
            __('Coloris en stock'), __('Quantité en stock'), __('Ruptures'), __('Valeur du stock'),
        ], array_map(fn ($p) => [
            $p['nom'] === 'Non attribué' ? __('Non attribué') : $p['nom'], $p['ventes']['tickets'], $p['ventes']['ca'], $p['ventes']['cout'],
            $p['ventes']['marge'], (float) $p['ventes']['quantite'], $p['stock']['coloris'], (float) $p['stock']['quantite'],
            $p['stock']['ruptures'], $p['stock']['valeur'],
        ], $r['proprietaires']));
    }

    /** `du` et `au` (inclus) ; par défaut, le mois en cours. */
    private function periode(Request $request): array
    {
        $f = $request->validate(['du' => 'nullable|date', 'au' => 'nullable|date|after_or_equal:du']);

        return [
            Carbon::parse($f['du'] ?? now()->startOfMonth())->startOfDay(),
            Carbon::parse($f['au'] ?? now())->endOfDay(),
        ];
    }

    private function nom(string $quoi, Carbon $du, Carbon $au): string
    {
        return $quoi.'-'.$du->format('Y-m-d').'-'.$au->format('Y-m-d').'.csv';
    }

    private function date(?\DateTimeInterface $d): ?string
    {
        return $d ? Carbon::instance($d)->timezone(config('app.timezone'))->format('Y-m-d H:i') : null;
    }

    private function modePaiement(?string $mode): string
    {
        return match ($mode) {
            'especes' => __('Espèces'), 'flooz' => 'Flooz', 'tmoney' => 'T-Money', 'carte' => __('Carte'), default => (string) $mode,
        };
    }

    private function typeMouvement(string $type): string
    {
        return match ($type) {
            'entree' => __('Entrée'), 'vente' => __('Vente'), 'annulation' => __('Annulation'), 'ajustement' => __('Ajustement'), default => $type,
        };
    }
}
