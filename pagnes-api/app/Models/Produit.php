<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Produit extends Model
{
    // `image` (chemin) n'est pas modifiable en masse : seul ProduitService::definirImage() le renseigne.
    protected $fillable = [
        'nom', 'type', 'motif', 'origine', 'yards_par_pagne',
        'vend_pagne', 'vend_yard', 'prix_pagne', 'prix_yard', 'prix_achat_pagne',
    ];

    // Le JSON expose `image_url` (adresse complète) et non le chemin de stockage.
    protected $hidden = ['image'];
    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'yards_par_pagne' => 'float',
            'vend_pagne' => 'boolean',
            'vend_yard' => 'boolean',
        ];
    }

    protected function imageUrl(): Attribute
    {
        return Attribute::get(fn () => $this->image ? url('photos/' . $this->image) : null);
    }

    public function variantes(): HasMany
    {
        return $this->hasMany(Variante::class);
    }

    /** Yards vendus pour une quantité donnée dans une unité donnée (pagne ou yard). */
    public function yardsPour(string $unite, float $quantite): float
    {
        return round($unite === 'pagne' ? $quantite * (float) $this->yards_par_pagne : $quantite, 2);
    }

    /** Coût figé pour un nombre de yards, au prorata du prix d'achat au pagne. */
    public function coutPourYards(float $yards): int
    {
        return (int) round(($yards * $this->prix_achat_pagne) / (float) $this->yards_par_pagne);
    }
}
