<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Personne à qui appartient une partie du stock d'une boutique (option « plusieurs propriétaires »). */
class Proprietaire extends Model
{
    use TenantScoped;

    protected $fillable = ['tenant_id', 'boutique_id', 'nom', 'user_id', 'actif'];

    protected function casts(): array
    {
        return ['actif' => 'boolean'];
    }

    public function motifs(): HasMany
    {
        return $this->hasMany(ProprietaireMotif::class);
    }

    public function produits(): HasMany
    {
        return $this->hasMany(Produit::class);
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
