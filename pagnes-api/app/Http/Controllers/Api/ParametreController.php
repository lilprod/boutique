<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Parametre;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ParametreController extends Controller
{
    public function show(Request $request)
    {
        return Parametre::actuel($request->user());
    }

    /** Réservé à l'administrateur (voir routes/api.php). */
    public function update(Request $request, StockService $stock)
    {
        $data = $request->validate([
            'boutique' => 'required|string|max:150',
            'adresse' => 'nullable|string|max:190',
            'telephone' => 'nullable|string|max:40',
            'ticket_format' => 'required|in:80mm,A4',
            'remise_max_vendeur' => 'required|integer|min:0|max:100',
            'message_ticket' => 'nullable|string|max:500',
            'autorise_pagne' => 'required|boolean',
            'autorise_yard' => 'required|boolean',
            'autorise_metre' => 'required|boolean',
            'quantite_min_panier' => 'required|numeric|min:1|max:100000',
            'unite_stock' => 'required|in:yard,pagne,metre',
            'multi_proprietaires' => 'sometimes|boolean',
            'fidelite_active' => 'sometimes|boolean',
            'fidelite_tranche' => 'sometimes|integer|min:1|max:100000000',
            'fidelite_valeur_point' => 'sometimes|integer|min:1|max:1000000',
            'fidelite_seuil' => 'sometimes|integer|min:0|max:100000000',
            'fidelite_expiration_mois' => 'sometimes|integer|min:0|max:120',
        ]);
        if (! $data['autorise_pagne'] && ! $data['autorise_yard'] && ! $data['autorise_metre']) {
            return response()->json(['message' => __('Autorisez au moins une unité de vente.')], 422);
        }
        $user = $request->user();
        $id = Parametre::actuel($user)->id;

        $p = DB::transaction(function () use ($user, $id, $data, $stock) {
            // Même verrou que VenteService : aucune vente ne passe pendant une conversion d'unité de stock.
            $p = Parametre::query()->forCurrentTenant($user)->forCurrentBoutique($user)->whereKey($id)->lockForUpdate()->firstOrFail();
            $stock->changerUnite($p, $data['unite_stock']);
            $p->update(array_merge(Arr::except($data, 'unite_stock'), [
                'tenant_id' => $user->tenant_id,
                'boutique_id' => $user->boutique_id,
            ]));

            return $p;
        });

        return response()->json($p);
    }
}
