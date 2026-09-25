<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClientController extends Controller
{
    public function index()
    {
        // withCount/withSum évitent le N+1 pour les colonnes « Achats » et « Total dépensé ».
        return Client::withCount(['ventes as achats' => fn ($q) => $q->where('statut', 'validee')])
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
        return response()->json(Client::create($data), 201);
    }

    public function update(Request $request, Client $client)
    {
        $data = $request->validate(['nom' => 'required|string|max:190', 'telephone' => 'nullable|string|max:40', 'adresse' => 'nullable|string|max:190']);
        $client->update($data);
        return response()->json($client);
    }

    public function destroy(Client $client)
    {
        $client->delete(); // ventes.client_id passe à NULL (nullOnDelete) : l'historique reste.
        return response()->noContent();
    }
}
