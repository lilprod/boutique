<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Produit;
use App\Models\Promotion;
use App\Models\Variante;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PromotionController extends Controller
{
    /** L'administrateur voit toutes les promotions ; un vendeur, celles en cours (affichées à la caisse). */
    public function index(Request $request)
    {
        $q = Promotion::query()->forCurrentContext($request->user());
        if (! $request->user()->estAdmin()) {
            $q->enCours();
        }

        return $q->orderByDesc('actif')->orderByDesc('id')->get();
    }

    public function store(Request $request)
    {
        $user = $request->user();

        return response()->json(Promotion::create($this->valider($request) + [
            'tenant_id' => $user->tenant_id, 'boutique_id' => $user->boutique_id,
        ]), 201);
    }

    public function update(Request $request, Promotion $promotion)
    {
        abort_unless($promotion->belongsToCurrentContext($request->user()), 404);
        $promotion->update($this->valider($request));

        return $promotion->fresh();
    }

    /** Les ventes passées gardent le nom de la promotion (gelé sur la ligne). */
    public function destroy(Request $request, Promotion $promotion)
    {
        abort_unless($promotion->belongsToCurrentContext($request->user()), 404);
        $promotion->delete();

        return response()->noContent();
    }

    private function valider(Request $request): array
    {
        $user = $request->user();
        $dansLaBoutique = fn (string $table) => Rule::exists($table, 'id')->where('tenant_id', $user->tenant_id)->where('boutique_id', $user->boutique_id);

        $data = $request->validate([
            'nom' => 'required|string|max:120',
            'type_remise' => 'required|in:pct,fcfa',
            'valeur' => 'required|numeric|gt:0',
            'cible' => 'required|in:tout,type,motif,produit,variante',
            'cible_texte' => 'nullable|required_if:cible,type,motif|string|max:100',
            'produit_id' => ['nullable', 'required_if:cible,produit', 'integer', $dansLaBoutique((new Produit)->getTable())],
            'variante_id' => ['nullable', 'required_if:cible,variante', 'integer', $dansLaBoutique((new Variante)->getTable())],
            'unite' => 'nullable|in:pagne,yard,metre',
            'quantite_min' => 'nullable|numeric|min:0|max:100000',
            'debut' => 'nullable|date',
            'fin' => 'nullable|date|after_or_equal:debut',
            'actif' => 'sometimes|boolean',
        ], [
            'cible_texte.required_if' => 'Indiquez le type ou le motif visé.',
            'produit_id.required_if' => 'Choisissez le produit visé.',
            'variante_id.required_if' => 'Choisissez le coloris visé.',
            'fin.after_or_equal' => 'La date de fin doit suivre la date de début.',
        ]);

        // Règles qui dépendent de plusieurs champs.
        validator($data, [])->after(function (Validator $v) use ($data) {
            if ($data['type_remise'] === 'pct' && $data['valeur'] > 100) {
                $v->errors()->add('valeur', 'Un pourcentage ne peut pas dépasser 100.');
            }
            // « −2 000 FCFA » ou « dès 3 » n'ont de sens que pour une unité précise (pagne, yard ou mètre).
            if (empty($data['unite']) && ($data['type_remise'] === 'fcfa' || ($data['quantite_min'] ?? 0) > 0)) {
                $v->errors()->add('unite', 'Précisez l’unité : une remise en FCFA ou une quantité minimale se comptent par pagne, par yard ou par mètre.');
            }
        })->validate();

        // Seul le champ qui correspond à la cible est conservé.
        return array_merge($data, [
            'cible_texte' => in_array($data['cible'], ['type', 'motif'], true) ? trim($data['cible_texte']) : null,
            'produit_id' => $data['cible'] === 'produit' ? $data['produit_id'] : null,
            'variante_id' => $data['cible'] === 'variante' ? $data['variante_id'] : null,
            'quantite_min' => $data['quantite_min'] ?? 0,
        ]);
    }
}
