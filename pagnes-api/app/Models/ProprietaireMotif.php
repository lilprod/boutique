<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Règle d'attribution : les produits de ce motif appartiennent à ce propriétaire. */
class ProprietaireMotif extends Model
{
    use TenantScoped;

    protected $fillable = ['tenant_id', 'boutique_id', 'proprietaire_id', 'motif'];

    public function proprietaire(): BelongsTo
    {
        return $this->belongsTo(Proprietaire::class);
    }
}
