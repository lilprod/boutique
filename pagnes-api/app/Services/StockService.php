<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\Mouvement;
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
            $variante = Variante::lockForUpdate()->findOrFail($variante->id);
            $produit = $variante->produit;
            $yards = $produit->yardsPour($unite, $quantite);

            $variante->increment('stock', $yards);
            if ($prixAchatPagne && $prixAchatPagne > 0) {
                $produit->update(['prix_achat_pagne' => $prixAchatPagne]);
            }
            Mouvement::create([
                'variante_id' => $variante->id, 'type' => 'entree', 'yards' => $yards, 'user_id' => $utilisateur->id,
                'motif' => trim($motif ?? '') ?: 'Réapprovisionnement',
                'fournisseur' => $fournisseur ? trim($fournisseur) : null,
                'prix_achat_pagne' => $prixAchatPagne > 0 ? $prixAchatPagne : null,
            ]);

            return $variante->refresh();
        });
    }

    public function ajuster(Variante $variante, User $utilisateur, float $nouveauStock, string $motif): Variante
    {
        if ($nouveauStock < 0) {
            throw new RegleMetierException('Indiquez une quantité valide.');
        }
        if (trim($motif) === '') {
            throw new RegleMetierException('Le motif est obligatoire.');
        }

        return DB::transaction(function () use ($variante, $utilisateur, $nouveauStock, $motif) {
            $variante = Variante::lockForUpdate()->findOrFail($variante->id);
            $delta = round($nouveauStock - (float) $variante->stock, 2);
            if ($delta === 0.0) {
                throw new RegleMetierException('Le stock compté est identique au stock enregistré.');
            }

            $variante->update(['stock' => $nouveauStock]);
            Mouvement::create([
                'variante_id' => $variante->id, 'type' => 'ajustement', 'yards' => $delta,
                'user_id' => $utilisateur->id, 'motif' => trim($motif),
            ]);

            return $variante;
        });
    }
}
