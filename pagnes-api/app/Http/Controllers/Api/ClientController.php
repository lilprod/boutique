<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Services\FideliteService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ClientController extends Controller
{
    /**
     * Clients de la boutique, paginés (100 par défaut, 200 au plus), triés par nom.
     * `?q=` : recherche dans le nom, le téléphone (chiffres seuls, espaces ignorés) et l'adresse.
     * C'est cette recherche que la caisse et la page Clients interrogent à chaque frappe.
     */
    public function index(Request $request)
    {
        $filtres = $request->validate(['q' => 'nullable|string|max:100']);

        return $this->avecStatistiques(Client::query()->forCurrentContext($request->user()))
            ->when(trim($filtres['q'] ?? '') !== '', fn (Builder $q) => $this->recherche($q, trim($filtres['q'])))
            ->orderBy('nom')->orderBy('id')
            ->paginate(max(1, min(200, $request->integer('per_page', 100))))
            ->through(fn (Client $c) => $this->formater($c));
    }

    /** Une fiche, avec les mêmes statistiques que la liste (solde de points à jour compris). */
    public function show(Request $request, Client $client)
    {
        abort_unless($client->belongsToCurrentContext($request->user()), 404);

        return $this->formater($this->avecStatistiques(Client::query())->findOrFail($client->id));
    }

    /** withCount/withSum/withMax : achats, dépense et dernier achat (ventes validées) sans requête par client. */
    private function avecStatistiques(Builder $q): Builder
    {
        $validees = fn ($v) => $v->where('statut', 'validee');

        return $q->withCount(['ventes as achats' => $validees])
            ->withSum(['ventes as depense' => $validees], 'total')
            ->withMax(['ventes as derniere_vente' => $validees], 'created_at');
    }

    private function recherche(Builder $q, string $mot): void
    {
        $like = '%'.addcslashes($mot, '%_\\').'%';
        $chiffres = preg_replace('/\D+/', '', $mot);
        $q->where(function (Builder $w) use ($like, $chiffres) {
            $w->where('nom', 'like', $like)->orWhere('adresse', 'like', $like)->orWhere('telephone', 'like', $like);
            // « 90 12 34 » retrouve « +228 90123456 » : on compare aussi les chiffres seuls.
            if (strlen($chiffres) >= 3) {
                $w->orWhereRaw("REPLACE(REPLACE(REPLACE(telephone, ' ', ''), '-', ''), '.', '') LIKE ?", ['%'.$chiffres.'%']);
            }
        });
    }

    private function formater(Client $c): Client
    {
        $c->depense = (int) $c->depense;
        $c->derniere_vente = $c->derniere_vente ? Carbon::parse($c->derniere_vente)->toIso8601String() : null;

        return $c;
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
