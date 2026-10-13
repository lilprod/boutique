<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\LigneVente;
use App\Models\Mouvement;
use App\Models\Parametre;
use App\Models\Produit;
use App\Models\User;
use App\Models\Variante;
use Illuminate\Support\Facades\DB;

class StockService
{
    public function entree(Variante $variante, User $utilisateur, string $unite, float $quantite, ?string $fournisseur, ?int $prixAchatPagne, ?string $motif): Variante
    {
        if ($quantite <= 0) {
            throw new RegleMetierException('Indiquez une quantité valide.');
        }

        return DB::transaction(function () use ($variante, $utilisateur, $unite, $quantite, $fournisseur, $prixAchatPagne, $motif) {
            $variante = Variante::query()->forCurrentContext($utilisateur)->whereKey($variante->id)->lockForUpdate()->firstOrFail();
            $produit = $variante->produit;
            $quantiteStock = $produit->quantitePour($unite, $quantite, Parametre::actuel($utilisateur)->unite_stock);

            $variante->increment('stock', $quantiteStock);
            if ($prixAchatPagne && $prixAchatPagne > 0) {
                $produit->update(['prix_achat_pagne' => $prixAchatPagne]);
            }
            Mouvement::create([
                'tenant_id' => $variante->tenant_id,
                'boutique_id' => $variante->boutique_id,
                'variante_id' => $variante->id, 'type' => 'entree', 'quantite' => $quantiteStock, 'user_id' => $utilisateur->id,
                'motif' => trim($motif ?? '') ?: 'Réapprovisionnement',
                'fournisseur' => $fournisseur ? trim($fournisseur) : null,
                'prix_achat_pagne' => $prixAchatPagne > 0 ? $prixAchatPagne : null,
            ]);

            return $variante->refresh();
        });
    }

    /**
     * Change l'unité de stock de la boutique en convertissant tout ce qui y est exprimé :
     * stock et seuil des coloris, historique des mouvements, et quantité gelée des lignes
     * de vente (sinon l'annulation d'une ancienne vente restaurerait dans l'ancienne unité).
     * À appeler dans une transaction, ligne de paramètres verrouillée.
     */
    public function changerUnite(Parametre $parametres, string $nouvelle): void
    {
        $ancienne = $parametres->unite_stock;
        if ($ancienne === $nouvelle) {
            return;
        }

        $produits = Produit::query()
            ->where('tenant_id', $parametres->tenant_id)
            ->where('boutique_id', $parametres->boutique_id)
            ->get();

        foreach ($produits as $produit) {
            // Facteur non arrondi : on n'arrondit qu'une fois, sur la valeur convertie.
            $facteur = sprintf('%.10F', $produit->quantitePour($ancienne, 1000000, $nouvelle) / 1000000);
            $varianteIds = $produit->variantes()->pluck('id');

            Variante::whereIn('id', $varianteIds)->update([
                'stock' => DB::raw("ROUND(stock * {$facteur}, 2)"),
                'seuil' => DB::raw("ROUND(seuil * {$facteur}, 2)"),
            ]);
            Mouvement::whereIn('variante_id', $varianteIds)->update(['quantite' => DB::raw("ROUND(quantite * {$facteur}, 2)")]);
            LigneVente::where('produit_id', $produit->id)->update(['quantite_stock' => DB::raw("ROUND(quantite_stock * {$facteur}, 2)")]);
        }

        $parametres->update(['unite_stock' => $nouvelle]);
    }

    /** `$nouveauStock` est déjà exprimé dans l'unité de stock de la boutique. */
    public function ajuster(Variante $variante, User $utilisateur, float $nouveauStock, string $motif): Variante
    {
        if ($nouveauStock < 0) {
            throw new RegleMetierException('Indiquez une quantité valide.');
        }
        if (trim($motif) === '') {
            throw new RegleMetierException('Le motif est obligatoire.');
        }

        return DB::transaction(function () use ($variante, $utilisateur, $nouveauStock, $motif) {
            $variante = Variante::query()->forCurrentContext($utilisateur)->whereKey($variante->id)->lockForUpdate()->firstOrFail();
            $delta = round($nouveauStock - (float) $variante->stock, 2);
            if ($delta === 0.0) {
                throw new RegleMetierException('Le stock compté est identique au stock enregistré.');
            }

            $variante->update(['stock' => $nouveauStock]);
            Mouvement::create([
                'tenant_id' => $variante->tenant_id,
                'boutique_id' => $variante->boutique_id,
                'variante_id' => $variante->id, 'type' => 'ajustement', 'quantite' => $delta,
                'user_id' => $utilisateur->id, 'motif' => trim($motif),
            ]);

            return $variante;
        });
    }
}
