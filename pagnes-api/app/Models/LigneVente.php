<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LigneVente extends Model
{
    use TenantScoped;

    // Laravel déduirait `ligne_ventes` ; la migration crée `lignes_vente`.
    protected $table = 'lignes_vente';

    protected $fillable = [
        'tenant_id', 'boutique_id', 'vente_id', 'variante_id', 'produit_id', 'proprietaire_id', 'libelle', 'coloris', 'unite', 'quantite',
        'yards', 'quantite_stock', 'prix_unitaire', 'brut', 'remise_type', 'remise_valeur', 'promotion_id', 'promotion_libelle', 'remise_promo',
        'total', 'net', 'cout',
    ];

    protected function casts(): array
    {
        return ['quantite' => 'float', 'yards' => 'float', 'quantite_stock' => 'float', 'remise_valeur' => 'float'];
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
}
