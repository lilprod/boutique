<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Mouvement extends Model
{
    use TenantScoped;

    // `quantite` est exprimée dans l'unité de stock de la boutique (parametres.unite_stock).
    protected $fillable = ['tenant_id', 'boutique_id', 'variante_id', 'type', 'quantite', 'user_id', 'motif', 'fournisseur', 'prix_achat_pagne', 'vente_id'];

    protected function casts(): array
    {
        return ['quantite' => 'float'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }

    public function variante(): BelongsTo
    {
        return $this->belongsTo(Variante::class);
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
