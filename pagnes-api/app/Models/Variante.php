<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Variante extends Model
{
    use TenantScoped;

    protected $fillable = ['tenant_id', 'boutique_id', 'produit_id', 'coloris', 'sku', 'c1', 'c2', 'stock', 'seuil'];

    protected function casts(): array
    {
        return ['stock' => 'float', 'seuil' => 'float'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
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
