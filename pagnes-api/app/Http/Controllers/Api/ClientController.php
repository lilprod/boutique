<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Services\FideliteService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        // withCount/withSum évitent le N+1 pour les colonnes « Achats » et « Total dépensé ».
        return Client::query()
            ->forCurrentTenant($request->user())
            ->forCurrentBoutique($request->user())
            ->withCount(['ventes as achats' => fn ($q) => $q->where('statut', 'validee')])
            ->withSum(['ventes as depense' => fn ($q) => $q->where('statut', 'validee')], 'total')
            ->withMax(['ventes as derniere_vente' => fn ($q) => $q->where('statut', 'validee')], 'created_at')
            ->orderBy('nom')->get()
            ->each(function (Client $c) {
                $c->depense = (int) $c->depense;
                $c->derniere_vente = $c->derniere_vente ? Carbon::parse($c->derniere_vente)->toIso8601String() : null;
            });
    }

    public function store(Request $request)
    {
        $data = $request->validate(['nom' => 'required|string|max:190', 'telephone' => 'nullable|string|max:40', 'adresse' => 'nullable|string|max:190']);

        return response()->json(Client::create(array_merge($data, [
            'tenant_id' => $request->user()->tenant_id,
            'boutique_id' => $request->user()->boutique_id,
        ])), 201);
    }

    public function update(Request $request, Client $client)
    {
        abort_unless($client->belongsToCurrentContext($request->user()), 404);

        $data = $request->validate(['nom' => 'required|string|max:190', 'telephone' => 'nullable|string|max:40', 'adresse' => 'nullable|string|max:190']);
        $client->update(array_merge($data, [
            'tenant_id' => $request->user()->tenant_id,
            'boutique_id' => $request->user()->boutique_id,
        ]));

        return response()->json($client);
    }

    /** Historique des points de fidélité du client, le plus récent d'abord. */
    public function points(Request $request, Client $client)
    {
        abort_unless($client->belongsToCurrentContext($request->user()), 404);

        return [
            'solde' => $client->points,
            'mouvements' => $client->mouvementsPoints()->with('utilisateur:id,nom', 'vente:id,numero')
                ->latest()->latest('id')->limit(200)->get(),
        ];
    }

    /** Ajout ou retrait manuel de points (administrateur), toujours avec un motif. */
    public function ajusterPoints(Request $request, Client $client, FideliteService $fidelite)
    {
        abort_unless($client->belongsToCurrentContext($request->user()), 404);
        $data = $request->validate(['points' => 'required|integer|between:-100000000,100000000', 'motif' => 'required|string|max:190']);
        try {
            return response()->json($fidelite->ajuster($client, (int) $data['points'], $data['motif'], $request->user()));
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function destroy(Request $request, Client $client)
    {
        abort_unless($client->belongsToCurrentContext($request->user()), 404);

        $client->delete(); // ventes.client_id passe à NULL (nullOnDelete) : l'historique reste.

        return response()->noContent();
    }
}
