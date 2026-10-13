<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\LigneVente;
use App\Models\Parametre;
use App\Models\Proprietaire;
use App\Models\Variante;
use App\Services\ProprietaireService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class ProprietaireController extends Controller
{
    public function __construct(private ProprietaireService $service) {}

    /** Lecture ouverte à toute la boutique : la caisse et le stock filtrent par propriétaire. */
    public function index(Request $request)
    {
        return Proprietaire::query()->forCurrentContext($request->user())
            ->with('motifs:id,proprietaire_id,motif')->withCount('produits')
            ->orderByDesc('actif')->orderBy('nom')->get();
    }

    public function store(Request $request)
    {
        return $this->enregistrer($request, null);
    }

    public function update(Request $request, Proprietaire $proprietaire)
    {
        abort_unless($proprietaire->belongsToCurrentContext($request->user()), 404);

        return $this->enregistrer($request, $proprietaire);
    }

    public function destroy(Request $request, Proprietaire $proprietaire)
    {
        abort_unless($proprietaire->belongsToCurrentContext($request->user()), 404);
        try {
            $this->service->supprimer($proprietaire);

            return response()->noContent();
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function enregistrer(Request $request, ?Proprietaire $proprietaire)
    {
        $user = $request->user();
        $data = $request->validate([
            'nom' => 'required|string|max:150',
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $user->tenant_id)],
            'actif' => 'sometimes|boolean',
            'motifs' => 'sometimes|array|max:200',
            'motifs.*' => 'string|max:100',
        ]);
        try {
            return response()->json($this->service->enregistrer($proprietaire, $data, $user), $proprietaire ? 200 : 201);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * Ce que chaque propriétaire a vendu sur la période (ventes validées, net de la remise
     * globale du ticket) et ce qu'il lui reste en stock. Le net encaissé est ce qui lui revient.
     */
    public function rapport(Request $request)
    {
        $user = $request->user();
        $f = $request->validate(['du' => 'nullable|date', 'au' => 'nullable|date|after_or_equal:du']);
        $du = Carbon::parse($f['du'] ?? now()->startOfMonth())->startOfDay();
        $au = Carbon::parse($f['au'] ?? now())->endOfDay();

        $ventes = LigneVente::query()->forCurrentContext($user)
            ->join('ventes', 'ventes.id', '=', 'lignes_vente.vente_id')
            ->where('ventes.statut', 'validee')
            ->whereBetween('ventes.created_at', [$du, $au])
            ->groupBy('lignes_vente.proprietaire_id')
            ->selectRaw('lignes_vente.proprietaire_id, COUNT(DISTINCT lignes_vente.vente_id) as tickets, SUM(lignes_vente.net) as ca, SUM(lignes_vente.cout) as cout, SUM(lignes_vente.quantite_stock) as quantite')
            ->get()->keyBy(fn ($l) => $l->proprietaire_id ?? 0);

        $uniteStock = Parametre::actuel($user)->unite_stock;
        $stock = [];
        foreach (Variante::query()->forCurrentContext($user)->with('produit')->get() as $v) {
            $cle = $v->produit->proprietaire_id ?? 0;
            $s = $stock[$cle] ??= ['coloris' => 0, 'quantite' => 0.0, 'ruptures' => 0, 'valeur' => 0];
            $s['coloris']++;
            $s['quantite'] += (float) $v->stock;
            $s['ruptures'] += (float) $v->stock <= 0 ? 1 : 0;
            $s['valeur'] += $v->produit->coutPourYards($v->produit->yardsPour($uniteStock, max(0, (float) $v->stock)));
            $stock[$cle] = $s;
        }

        $proprietaires = Proprietaire::query()->forCurrentContext($user)->orderBy('nom')->get(['id', 'nom', 'actif']);
        $lignes = $proprietaires->map(fn ($p) => ['id' => $p->id, 'nom' => $p->nom, 'actif' => $p->actif])->all();
        if ($ventes->has(0) || isset($stock[0])) {
            $lignes[] = ['id' => null, 'nom' => 'Non attribué', 'actif' => true];
        }

        $resultat = array_map(function ($p) use ($ventes, $stock) {
            $v = $ventes->get($p['id'] ?? 0);
            $s = $stock[$p['id'] ?? 0] ?? ['coloris' => 0, 'quantite' => 0, 'ruptures' => 0, 'valeur' => 0];
            $ca = (int) ($v->ca ?? 0);

            return $p + [
                'ventes' => [
                    'tickets' => (int) ($v->tickets ?? 0), 'ca' => $ca, 'cout' => (int) ($v->cout ?? 0),
                    'marge' => $ca - (int) ($v->cout ?? 0), 'quantite' => round((float) ($v->quantite ?? 0), 2),
                ],
                'stock' => ['coloris' => $s['coloris'], 'quantite' => round($s['quantite'], 2), 'ruptures' => $s['ruptures'], 'valeur' => (int) $s['valeur']],
            ];
        }, $lignes);

        return [
            'du' => $du->toDateString(), 'au' => $au->toDateString(), 'unite_stock' => $uniteStock,
            'proprietaires' => $resultat,
            'total_ca' => array_sum(array_map(fn ($r) => $r['ventes']['ca'], $resultat)),
        ];
    }
}
