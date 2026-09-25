<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Variante;
use App\Services\StockService;
use Illuminate\Http\Request;

/** Entrées de stock, ajustements et historique des mouvements — la page « Stock » de la Phase 1. */
class VarianteController extends Controller
{
    public function __construct(private StockService $service) {}

    public function entree(Request $request, Variante $variante)
    {
        $data = $request->validate([
            'unite' => 'required|in:pagne,yard',
            'quantite' => 'required|numeric',
            'fournisseur' => 'nullable|string|max:150',
            'prix_achat_pagne' => 'nullable|integer|min:0',
            'motif' => 'nullable|string|max:190',
        ]);

        try {
            $v = $this->service->entree(
                $variante, $request->user(), $data['unite'], (float) $data['quantite'],
                $data['fournisseur'] ?? null, $data['prix_achat_pagne'] ?? null, $data['motif'] ?? null
            );
            return response()->json($v);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function ajuster(Request $request, Variante $variante)
    {
        $data = $request->validate(['nouveau_stock' => 'required|numeric|min:0', 'motif' => 'required|string|max:190']);

        try {
            $v = $this->service->ajuster($variante, $request->user(), (float) $data['nouveau_stock'], $data['motif']);
            return response()->json($v);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** Historique des mouvements, filtrable par type et par variante (voir onglet « Mouvements »). */
    public function mouvements(Request $request)
    {
        // Ni variante ni produit embarqués (photo comprise) : le frontend les a déjà via /produits.
        $q = \App\Models\Mouvement::with('utilisateur:id,nom')->latest()->latest('id');
        if ($request->filled('type')) $q->where('type', $request->string('type'));
        if ($request->filled('variante_id')) $q->where('variante_id', $request->integer('variante_id'));
        $page = $q->paginate(max(1, min(200, $request->integer('per_page', 200))));
        if (!$request->user()->estAdmin()) {
            $page->getCollection()->each->makeHidden('prix_achat_pagne');
        }
        return $page;
    }
}
