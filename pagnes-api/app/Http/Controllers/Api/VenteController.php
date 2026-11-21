<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\RegleMetierException;
use App\Http\Controllers\Controller;
use App\Models\Vente;
use App\Services\VenteService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class VenteController extends Controller
{
    public function __construct(private VenteService $service) {}

    public function index(Request $request)
    {
        // `vendeur:id,nom` : jamais l'identifiant de connexion ni le rôle d'un collègue.
        $q = Vente::query()
            ->forCurrentTenant($request->user())
            ->forCurrentBoutique($request->user())
            ->with('lignes', 'client', 'vendeur:id,nom')->latest()->latest('id'); // id : départage les ventes de la même seconde
        if (! $request->user()->estAdmin()) {
            $q->where('vendeur_id', $request->user()->id); // un vendeur ne voit que ses propres ventes
        }
        $filtres = $request->validate([
            'statut' => 'nullable|in:validee,annulee',
            'q' => 'nullable|string|max:100',
            'du' => 'nullable|date',
            'au' => 'nullable|date',
        ]);
        if (! empty($filtres['statut'])) {
            $q->where('statut', $filtres['statut']);
        }
        if (! empty($filtres['du'])) {
            $q->where('created_at', '>=', Carbon::parse($filtres['du'])->startOfDay());
        }
        if (! empty($filtres['au'])) {
            $q->where('created_at', '<=', Carbon::parse($filtres['au'])->endOfDay());
        }
        if (! empty($filtres['q'])) {
            $this->recherche($q, trim($filtres['q']));
        }
        // per_page (1-200) : l'écran « Ventes » lit l'historique page par page.
        $page = $q->paginate(max(1, min(200, $request->integer('per_page', 50))));
        $page->getCollection()->each(fn (Vente $v) => $this->masquerCouts($v, $request));

        return $page;
    }

    /** Recherche libre : numéro (« V-00012 » ou « 12 »), client, vendeur, article, coloris ou référence de paiement. */
    private function recherche(Builder $q, string $mot): void
    {
        $like = '%'.addcslashes($mot, '%_\\').'%';
        $q->where(function (Builder $w) use ($mot, $like) {
            $w->where('paiement_reference', 'like', $like)
                ->orWhereHas('client', fn (Builder $c) => $c->where('nom', 'like', $like))
                ->orWhereHas('vendeur', fn (Builder $c) => $c->where('nom', 'like', $like))
                ->orWhereHas('lignes', fn (Builder $c) => $c->where('libelle', 'like', $like)->orWhere('coloris', 'like', $like));
            if (preg_match('/^v?-?0*(\d+)$/i', $mot, $m)) {
                $w->orWhere('numero', (int) $m[1]);
            }
        });
    }

    public function show(Request $request, Vente $vente)
    {
        abort_unless($vente->belongsToCurrentContext($request->user()), 404);
        abort_unless($request->user()->estAdmin() || $vente->vendeur_id === $request->user()->id, 403, __('Cette vente ne vous appartient pas.'));

        return $this->masquerCouts($vente->load('lignes', 'client', 'vendeur:id,nom'), $request);
    }

    /** La marge et le coût d'achat ne sont visibles que de l'administrateur. */
    private function masquerCouts(Vente $vente, Request $request): Vente
    {
        if (! $request->user()->estAdmin()) {
            $vente->makeHidden('marge');
            $vente->lignes->each->makeHidden('cout');
        }

        return $vente;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'client_id' => [
                'nullable',
                'integer',
                Rule::exists('clients', 'id')->where('tenant_id', $request->user()->tenant_id)->where('boutique_id', $request->user()->boutique_id),
            ],
            'remise_type' => 'required|in:pct,fcfa',
            'remise_valeur' => 'required|numeric|min:0',
            'paiement.mode' => 'required|in:especes,flooz,tmoney,carte',
            'paiement.reference' => 'nullable|string|max:100',
            'paiement.recu' => 'nullable|integer|min:0',
            'lignes' => 'required|array|min:1',
            'lignes.*.variante_id' => 'required|integer|exists:variantes,id',
            'lignes.*.unite' => 'required|in:pagne,yard,metre',
            'lignes.*.quantite' => 'required|numeric|min:0.01',
            'lignes.*.remise_type' => 'nullable|in:pct,fcfa',
            'lignes.*.remise_valeur' => 'nullable|numeric|min:0',
            'points_utilises' => 'nullable|integer|min:0|max:100000000',
            // Caisse hors ligne : identifiant choisi par la tablette (envoi rejouable sans doublon),
            // heure réelle de la vente et montant encaissé sans le serveur.
            'uuid' => 'nullable|uuid',
            'hors_ligne' => 'nullable|array',
            'hors_ligne.vendue_le' => 'required_with:hors_ligne|date',
            'hors_ligne.total' => 'required_with:hors_ligne|integer|min:0',
        ]);

        $cart = array_map(fn ($l) => [
            'variante_id' => $l['variante_id'], 'unite' => $l['unite'], 'quantite' => $l['quantite'],
            'remise_type' => $l['remise_type'] ?? 'pct', 'remise_valeur' => $l['remise_valeur'] ?? 0,
        ], $data['lignes']);

        $horsLigne = isset($data['hors_ligne'])
            ? ['vendue_le' => Carbon::parse($data['hors_ligne']['vendue_le']), 'total' => (int) $data['hors_ligne']['total']]
            : null;
        $uuid = isset($data['uuid']) ? strtolower($data['uuid']) : null;
        $existait = $uuid !== null && Vente::query()->forCurrentContext($request->user())->where('uuid', $uuid)->exists();

        try {
            $vente = $this->service->valider(
                $request->user(), $cart, $data['client_id'] ?? null,
                $data['remise_type'], (float) $data['remise_valeur'], $data['paiement'], (int) ($data['points_utilises'] ?? 0),
                $horsLigne, $uuid
            );

            // 200 : cette vente avait déjà été reçue (renvoi après une coupure), rien n'a été enregistré de nouveau.
            return response()->json($this->masquerCouts($vente, $request), $existait ? 200 : 201);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (UniqueConstraintViolationException $e) {
            // Deux envois simultanés de la même vente : le second renvoie celle que le premier a enregistrée.
            $deja = $uuid !== null ? Vente::query()->forCurrentContext($request->user())->where('uuid', $uuid)->first() : null;
            if (! $deja) {
                throw $e; // autre contrainte : pas un renvoi de vente
            }

            return response()->json($this->masquerCouts($deja->load('lignes', 'client', 'vendeur:id,nom'), $request), 200);
        }
    }

    public function annuler(Request $request, Vente $vente)
    {
        abort_unless($vente->belongsToCurrentContext($request->user()), 404);

        $data = $request->validate(['motif' => 'required|string|max:190']);
        try {
            $vente = $this->service->annuler($vente, $request->user(), $data['motif']);

            return response()->json($vente);
        } catch (RegleMetierException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
