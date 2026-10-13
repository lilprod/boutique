<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Variation du solde de points d'un client (gain, utilisation, annulation d'une vente, ajustement). */
class MouvementPoints extends Model
{
    use TenantScoped;

    protected $table = 'mouvements_points';

    protected $fillable = ['tenant_id', 'boutique_id', 'client_id', 'vente_id', 'type', 'points', 'motif', 'user_id'];

    protected function casts(): array
    {
        return ['points' => 'integer'];
    }

    public function utilisateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function vente(): BelongsTo
    {
        return $this->belongsTo(Vente::class);
    }
}
