<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Vente;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Agrégats du tableau de bord, calculés par la base : le navigateur ne télécharge plus l'historique des ventes.
 * Un vendeur ne voit que ses propres ventes ; marge et répartition par vendeur sont réservées à l'administrateur.
 * Les jours sont ceux du fuseau de l'application (APP_TIMEZONE, Africa/Lome).
 */
class StatistiqueController extends Controller
{
    private const JOURS = 30;

    public function tableauDeBord(Request $request)
    {
        $user = $request->user();
        $admin = $user->estAdmin();
        $aujourdhui = now()->startOfDay();
        $debut = $aujourdhui->copy()->subDays(self::JOURS - 1);

        $ventes = fn (): Builder => Vente::query()->where('statut', 'validee')
            ->when(!$admin, fn (Builder $q) => $q->where('vendeur_id', $user->id));

        $parJour = $ventes()->where('created_at', '>=', $debut)
            ->selectRaw('DATE(created_at) as jour, COUNT(*) as nb, SUM(total) as ca, SUM(marge) as marge')
            ->groupBy('jour')->get()->keyBy('jour');

        // Série complète, jours sans vente compris (0), pour que la courbe n'ait pas de trou.
        $serie = [];
        for ($i = 0; $i < self::JOURS; $i++) {
            $date = $debut->copy()->addDays($i)->toDateString();
            $r = $parJour->get($date);
            $serie[] = ['date' => $date, 'ventes' => (int) ($r->nb ?? 0), 'ca' => (int) ($r->ca ?? 0)]
                + ($admin ? ['marge' => (int) ($r->marge ?? 0)] : []);
        }
        $jour = end($serie);

        $top = LigneVente::query()->join('ventes', 'ventes.id', '=', 'lignes_vente.vente_id')
            ->where('ventes.statut', 'validee')->where('ventes.created_at', '>=', $debut)
            ->when(!$admin, fn (Builder $q) => $q->where('ventes.vendeur_id', $user->id))
            ->selectRaw('lignes_vente.produit_id, MAX(lignes_vente.libelle) as libelle, SUM(lignes_vente.total) as montant, SUM(lignes_vente.yards) as yards')
            ->groupBy('lignes_vente.produit_id')->orderByDesc('montant')->limit(6)->get()
            ->map(fn ($l) => ['produit_id' => $l->produit_id, 'libelle' => $l->libelle, 'total' => (int) $l->montant, 'yards' => (float) $l->yards]);

        $dernieres = Vente::query()
            ->when(!$admin, fn (Builder $q) => $q->where('vendeur_id', $user->id)) // toutes les ventes, annulées comprises
            ->with('vendeur:id,nom', 'client:id,nom')->latest()->latest('id')->limit(7)
            ->get(['id', 'numero', 'vendeur_id', 'client_id', 'paiement_mode', 'statut', 'total', 'created_at']);

        $reponse = [
            'aujourd_hui' => $aujourdhui->toDateString(),
            'jour' => $admin
                ? ['ventes' => $jour['ventes'], 'ca' => $jour['ca'], 'marge' => $jour['marge']]
                : ['ventes' => $jour['ventes'], 'ca' => $jour['ca']],
            'serie' => $serie,
            'ca_periode' => array_sum(array_column($serie, 'ca')),
            'top_produits' => $top,
            'dernieres' => $dernieres,
        ];

        if ($admin) {
            $reponse['par_vendeur'] = $ventes()->where('ventes.created_at', '>=', $debut)
                ->join('users', 'users.id', '=', 'ventes.vendeur_id')
                ->selectRaw('ventes.vendeur_id, users.nom, SUM(ventes.total) as ca')
                ->groupBy('ventes.vendeur_id', 'users.nom')->orderByDesc('ca')->get()
                ->map(fn ($v) => ['vendeur_id' => $v->vendeur_id, 'nom' => $v->nom, 'total' => (int) $v->ca]);
        }

        return $reponse;
    }

    /** Fournisseurs déjà saisis dans les entrées de stock (suggestions du formulaire d'entrée). */
    public function fournisseurs()
    {
        return Mouvement::whereNotNull('fournisseur')->distinct()->orderBy('fournisseur')->limit(200)->pluck('fournisseur');
    }
}
