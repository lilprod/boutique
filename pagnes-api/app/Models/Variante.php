<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Variante extends Model
{
    protected $fillable = ['produit_id', 'coloris', 'sku', 'c1', 'c2', 'stock', 'seuil'];

    protected function casts(): array
    {
        return ['stock' => 'float', 'seuil' => 'float'];
    }

    public function produit(): BelongsTo
    {
        return $this->belongsTo(Produit::class);
    }

    public function statutStock(): string
    {
        return $this->stock <= 0 ? 'rupture' : ($this->stock <= $this->seuil ? 'bas' : 'ok');
    }
}
