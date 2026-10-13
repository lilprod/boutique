<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    use TenantScoped;

    // `points` n'est pas modifiable en masse : seul FideliteService fait varier le solde (avec trace).
    protected $fillable = ['tenant_id', 'boutique_id', 'nom', 'telephone', 'adresse'];

    protected function casts(): array
    {
        return ['points' => 'integer'];
    }

    public function mouvementsPoints(): HasMany
    {
        return $this->hasMany(MouvementPoints::class);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }

    public function ventes(): HasMany
    {
        return $this->hasMany(Vente::class);
    }
}
