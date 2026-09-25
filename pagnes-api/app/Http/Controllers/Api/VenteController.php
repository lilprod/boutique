<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Vente;
use App\Services\VenteService;
use Illuminate\Http\Request;

class VenteController extends Controller
{
    public function __construct(private VenteService $service) {}

    public function index(Request $request)
    {
        $q = Vente::with('lignes', 'client', 'vendeur')->latest()->latest('id'); // id : départage les ventes de la même seconde
        if (!$request->user()->estAdmin()) {
            $q->where('vendeur_id', $request->user()->id); // un vendeur ne voit que ses propres ventes
        }
        if ($request->filled('statut')) $q->where('statut', $request->string('statut'));
        $page = $q->paginate(50);
        $page->getCollection()->each(fn (Vente $v) => $this->masquerCouts($v, $request));
        return $page;
    }

    public function show(Request $request, Vente $vente)
    {
        abort_unless($request->user()->estAdmin() || $vente->vendeur_id === $request->user()->id, 403, 'Cette vente ne vous appartient pas.');
        return $this->masquerCouts($vente->load('lignes.variante', 'client', 'vendeur'), $request);
    }

    /** La marge et le coût d'achat ne sont visibles que de l'administrateur. */
    private function masquerCouts(Vente $vente, Request $request): Vente
    {
        if (!$request->user()->estAdmin()) {
            $vente->makeHidden('marge');
            $vente->lignes->each->makeHidden('cout');
        }
        return $vente;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => 'nullable|integer|exists:clients,id',
            'remise_type' => 'required|in:pct,fcfa',
            'remise_valeur' => 'required|numeric|min:0',
            'paiement.mode' => 'required|in:especes,flooz,tmoney,carte',
            'paiement.reference' => 'nullable|string|max:100',
            'paiement.recu' => 'nullable|integer|min:0',
            'lignes' => 'required|array|min:1',
            'lignes.*.variante_id' => 'required|integer|exists:variantes,id',
            'lignes.*.unite' => 'required|in:pagne,yard',
            'lignes.*.quantite' => 'required|numeric|min:0.01',
            'lignes.*.remise_type' => 'nullable|in:pct,fcfa',
            'lignes.*.remise_valeur' => 'nullable|numeric|min:0',
        ]);

        $cart = array_map(fn ($l) => [
            'variante_id' => $l['variante_id'], 'unite' => $l['unite'], 'quantite' => $l['quantite'],
            'remise_type' => $l['remise_type'] ?? 'pct', 'remise_valeur' => $l['remise_valeur'] ?? 0,
        ], $data['lignes']);

        try {
            $vente = $this->service->valider(
                $request->user(), $cart, $data['client_id'] ?? null,
                $data['remise_type'], (float) $data['remise_valeur'], $data['paiement']
            );
            return response()->json($this->masquerCouts($vente, $request), 201);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function annuler(Request $request, Vente $vente)
    {
        $data = $request->validate(['motif' => 'required|string|max:190']);
        try {
            $vente = $this->service->annuler($vente, $request->user(), $data['motif']);
            return response()->json($vente);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
