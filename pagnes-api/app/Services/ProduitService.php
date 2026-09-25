<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Produit;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProduitService
{
    /**
     * @param array $donnees champs de la table `produits`
     * @param array $variantes [['id' => ?int, 'coloris' => string, 'sku' => ?string, 'c1' => string, 'c2' => string, 'seuil' => float, 'stock' => ?float], ...]
     */
    public function enregistrer(?Produit $existant, array $donnees, array $variantes, User $utilisateur): Produit
    {
        if (trim($donnees['nom'] ?? '') === '') {
            throw new RegleMetierException('Le nom du produit est obligatoire.');
        }
        if (empty($donnees['vend_pagne']) && empty($donnees['vend_yard'])) {
            throw new RegleMetierException('Choisissez au moins une unité de vente (pagne ou yard).');
        }
        if (($donnees['yards_par_pagne'] ?? 0) <= 0) {
            throw new RegleMetierException('Le nombre de yards par pagne doit être supérieur à 0.');
        }
        if ((!empty($donnees['vend_pagne']) && ($donnees['prix_pagne'] ?? 0) <= 0)
            || (!empty($donnees['vend_yard']) && ($donnees['prix_yard'] ?? 0) <= 0)) {
            throw new RegleMetierException('Indiquez un prix de vente pour chaque unité vendable.');
        }
        if (count($variantes) === 0 || collect($variantes)->contains(fn ($v) => trim($v['coloris'] ?? '') === '')) {
            throw new RegleMetierException('Ajoutez au moins un coloris et donnez un nom à chacun.');
        }

        return DB::transaction(function () use ($existant, $donnees, $variantes, $utilisateur) {
            $produit = $existant ? tap($existant)->update($donnees) : Produit::create($donnees);

            // Chaque id reçu doit être un coloris de CE produit : sinon on pourrait modifier
            // (ou vider le stock de) la variante d'un autre produit.
            $idsConserves = collect($variantes)->pluck('id')->filter()->map(fn ($id) => (int) $id)->all();
            $idsDuProduit = $produit->variantes()->pluck('id')->map(fn ($id) => (int) $id)->all();
            if (array_diff($idsConserves, $idsDuProduit)) {
                throw new RegleMetierException('Coloris inconnu pour ce produit.');
            }

            // SKU unique, y compris entre les coloris envoyés dans la même requête.
            $skus = collect($variantes)->map(fn ($v) => trim($v['sku'] ?? ''))->filter();
            if ($skus->count() !== $skus->unique()->count()) {
                throw new RegleMetierException('Deux coloris ont le même SKU.');
            }
            foreach ($variantes as $v) {
                $sku = trim($v['sku'] ?? '');
                if ($sku !== '' && Variante::where('sku', $sku)->where('id', '!=', $v['id'] ?? 0)->exists()) {
                    throw new RegleMetierException("Le SKU « {$sku} » est déjà utilisé par un autre coloris.");
                }
            }

            $aSupprimer = $produit->variantes()->whereNotIn('id', $idsConserves ?: [0])->get();
            foreach ($aSupprimer as $v) {
                if (LigneVente::where('variante_id', $v->id)->exists()) {
                    throw new RegleMetierException("Le coloris « {$v->coloris} » a déjà été vendu : il ne peut pas être supprimé.");
                }
            }
            // Un coloris jamais vendu peut quand même avoir un historique (stock initial, entrées) :
            // ces mouvements sont en restrictOnDelete, on les retire avant le coloris.
            Mouvement::whereIn('variante_id', $aSupprimer->pluck('id'))->delete();
            Variante::destroy($aSupprimer->pluck('id'));

            foreach ($variantes as $v) {
                if (!empty($v['id'])) {
                    // Le SKU est NOT NULL : on ne le modifie que s'il est fourni, sinon on garde l'existant.
                    Variante::whereKey($v['id'])->update(array_filter([
                        'coloris' => trim($v['coloris']), 'sku' => trim($v['sku'] ?? '') ?: null,
                        'c1' => $v['c1'], 'c2' => $v['c2'], 'seuil' => $v['seuil'] ?? 0,
                    ], fn ($valeur) => $valeur !== null));
                } else {
                    $stockInitial = max(0, (float) ($v['stock'] ?? 0));
                    $nouvelle = $produit->variantes()->create([
                        'coloris' => trim($v['coloris']),
                        'sku' => trim($v['sku'] ?? '') ?: $this->skuLibre($produit),
                        'c1' => $v['c1'], 'c2' => $v['c2'], 'seuil' => $v['seuil'] ?? 0, 'stock' => $stockInitial,
                    ]);
                    if ($stockInitial > 0) {
                        Mouvement::create([
                            'variante_id' => $nouvelle->id, 'type' => 'entree', 'yards' => $stockInitial,
                            'user_id' => $utilisateur->id, 'motif' => 'Stock initial', 'prix_achat_pagne' => $produit->prix_achat_pagne,
                        ]);
                    }
                }
            }

            return $produit->fresh('variantes');
        });
    }

    /** Prochain SKU lisible et libre, au format TYPE-PP-NN (ex. WAX-07-02). */
    private function skuLibre(Produit $produit): string
    {
        $prefixe = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', \Illuminate\Support\Str::ascii($produit->type)), 0, 3)) ?: 'ART';
        for ($n = $produit->variantes()->count() + 1; ; $n++) {
            $sku = sprintf('%s-%02d-%02d', $prefixe, $produit->id, $n);
            if (!Variante::where('sku', $sku)->exists()) {
                return $sku;
            }
        }
    }

    /** Remplace la photo du produit ; l'ancien fichier est supprimé une fois le nouveau enregistré. */
    public function definirImage(Produit $produit, UploadedFile $fichier): Produit
    {
        $ancien = $produit->image;
        // Nom aléatoire et extension déduite du contenu réel (jamais celle envoyée par le client).
        $chemin = Storage::disk('photos')->putFileAs('produits', $fichier, Str::uuid() . '.' . $fichier->extension());
        if ($chemin === false) {
            throw new RegleMetierException("La photo n'a pas pu être enregistrée sur le serveur.");
        }
        $produit->forceFill(['image' => $chemin])->save();
        if ($ancien) {
            Storage::disk('photos')->delete($ancien);
        }

        return $produit->fresh('variantes');
    }

    public function retirerImage(Produit $produit): Produit
    {
        $ancien = $produit->image;
        $produit->forceFill(['image' => null])->save();
        if ($ancien) {
            Storage::disk('photos')->delete($ancien);
        }

        return $produit->fresh('variantes');
    }

    public function supprimer(Produit $produit): void
    {
        $image = $produit->image;
        $varianteIds = $produit->variantes()->pluck('id');
        if (LigneVente::whereIn('variante_id', $varianteIds)->exists()) {
            throw new RegleMetierException('Ce produit a déjà été vendu. Mettez son stock à zéro plutôt que de le supprimer.');
        }
        DB::transaction(function () use ($produit, $varianteIds) {
            Mouvement::whereIn('variante_id', $varianteIds)->delete();
            Variante::whereIn('id', $varianteIds)->delete();
            $produit->delete();
        });
        if ($image) {
            Storage::disk('photos')->delete($image); // après la transaction : le fichier n'est perdu que si la suppression a réussi
        }
    }
}
