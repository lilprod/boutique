<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Produit;
use App\Services\ProduitService;
use Illuminate\Http\Request;

class ProduitController extends Controller
{
    public function __construct(private ProduitService $service) {}

    public function index(Request $request)
    {
        $produits = Produit::with('variantes')->orderBy('nom')->get();
        // Le prix d'achat (donc la marge) reste réservé à l'administrateur, comme dans l'UI.
        return $request->user()->estAdmin() ? $produits : $produits->each->makeHidden('prix_achat_pagne');
    }

    public function store(Request $request)
    {
        return $this->save($request, null);
    }

    public function update(Request $request, Produit $produit)
    {
        return $this->save($request, $produit);
    }

    private function save(Request $request, ?Produit $produit)
    {
        $data = $request->validate([
            'nom' => 'required|string|max:190',
            'type' => 'required|string|max:100',
            'motif' => 'nullable|string|max:100',
            'origine' => 'nullable|string|max:100',
            'image' => 'nullable|string',
            'yards_par_pagne' => 'required|numeric|min:0.01',
            'vend_pagne' => 'required|boolean',
            'vend_yard' => 'required|boolean',
            'prix_pagne' => 'required|integer|min:0',
            'prix_yard' => 'required|integer|min:0',
            'prix_achat_pagne' => 'required|integer|min:0',
            'variantes' => 'required|array|min:1',
            'variantes.*.id' => 'nullable|integer|exists:variantes,id',
            'variantes.*.coloris' => 'required|string|max:100',
            'variantes.*.sku' => 'nullable|string|max:60',
            'variantes.*.c1' => 'required|string|max:7',
            'variantes.*.c2' => 'required|string|max:7',
            'variantes.*.seuil' => 'required|numeric|min:0',
            'variantes.*.stock' => 'nullable|numeric|min:0',
        ]);

        try {
            $produit = $this->service->enregistrer($produit, collect($data)->except('variantes')->all(), $data['variantes'], $request->user());
            return response()->json($produit);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function destroy(Request $request, Produit $produit)
    {
        try {
            $this->service->supprimer($produit);
            return response()->noContent();
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
