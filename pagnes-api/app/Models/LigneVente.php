<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LigneVente extends Model
{
    // Laravel déduirait `ligne_ventes` ; la migration crée `lignes_vente`.
    protected $table = 'lignes_vente';

    protected $fillable = [
        'vente_id', 'variante_id', 'produit_id', 'libelle', 'coloris', 'unite', 'quantite',
        'yards', 'prix_unitaire', 'brut', 'remise_type', 'remise_valeur', 'total', 'cout',
    ];

    protected function casts(): array
    {
        return ['quantite' => 'float', 'yards' => 'float', 'remise_valeur' => 'float'];
    }

    public function variante(): BelongsTo
    {
        return $this->belongsTo(Variante::class);
    }
}
