<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Mouvement extends Model
{
    protected $fillable = ['variante_id', 'type', 'yards', 'user_id', 'motif', 'fournisseur', 'prix_achat_pagne', 'vente_id'];

    protected function casts(): array
    {
        return ['yards' => 'float'];
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
