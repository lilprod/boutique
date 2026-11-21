<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Prix d'un produit valables à partir de `valable_du` (voir Produit::aLaDate). Écrit par l'événement `saved` de Produit. */
class PrixProduit extends Model
{
    protected $table = 'prix_produits';

    protected $fillable = ['tenant_id', 'boutique_id', 'produit_id', 'prix_pagne', 'prix_yard', 'prix_metre', 'prix_achat_pagne', 'user_id', 'valable_du'];

    protected function casts(): array
    {
        return ['valable_du' => 'datetime'];
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
