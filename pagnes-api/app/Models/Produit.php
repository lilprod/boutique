<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Produit extends Model
{
    use TenantScoped;

    // `image` (chemin) n'est pas modifiable en masse : seul ProduitService::definirImage() le renseigne.
    protected $fillable = [
        'tenant_id', 'boutique_id', 'proprietaire_id', 'nom', 'type', 'motif', 'origine', 'yards_par_pagne',
        'vend_pagne', 'vend_yard', 'vend_metre', 'prix_pagne', 'prix_yard', 'prix_metre', 'prix_achat_pagne',
    ];

    public const YARD_EN_METRES = 0.9144;

    public const UNITES = ['pagne', 'yard', 'metre'];

    public const LIBELLES_UNITES = ['pagne' => 'pagne', 'yard' => 'yard', 'metre' => 'mètre'];

    /** Nom de l'unité dans la langue de la requête (« mètre » / « metre »). */
    public static function libelleUnite(string $unite): string
    {
        return __(self::LIBELLES_UNITES[$unite] ?? $unite);
    }

    // Le JSON expose `image_url` (adresse complète) et non le chemin de stockage.
    protected $hidden = ['image'];

    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'yards_par_pagne' => 'float',
            'vend_pagne' => 'boolean',
            'vend_yard' => 'boolean',
            'vend_metre' => 'boolean',
        ];
    }

    protected function imageUrl(): Attribute
    {
        return Attribute::get(fn () => $this->image ? url('photos/'.$this->image) : null);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }

    public function variantes(): HasMany
    {
        return $this->hasMany(Variante::class);
    }

    public function vendAu(string $unite): bool
    {
        return match ($unite) {
            'pagne' => $this->vend_pagne,
            'yard' => $this->vend_yard,
            'metre' => $this->vend_metre,
            default => false,
        };
    }

    public function prixPour(string $unite): int
    {
        return (int) match ($unite) {
            'pagne' => $this->prix_pagne,
            'yard' => $this->prix_yard,
            'metre' => $this->prix_metre,
        };
    }

    /** Yards correspondant à une quantité dans une unité donnée : sert au calcul du coût (prix d'achat au pagne). */
    public function yardsPour(string $unite, float $quantite): float
    {
        return round($this->versYards($unite, $quantite), 2);
    }

    /** Convertit une quantité vendue ou reçue dans l'unité de stock de la boutique. */
    public function quantitePour(string $unite, float $quantite, string $uniteStock): float
    {
        return round($this->depuisYards($uniteStock, $this->versYards($unite, $quantite)), 2);
    }

    private function versYards(string $unite, float $quantite): float
    {
        return match ($unite) {
            'pagne' => $quantite * (float) $this->yards_par_pagne,
            'yard' => $quantite,
            'metre' => $quantite / self::YARD_EN_METRES,
        };
    }

    private function depuisYards(string $unite, float $yards): float
    {
        return match ($unite) {
            'pagne' => $yards / (float) $this->yards_par_pagne,
            'yard' => $yards,
            'metre' => $yards * self::YARD_EN_METRES,
        };
    }

    /** Coût figé pour un nombre de yards, au prorata du prix d'achat au pagne. */
    public function coutPourYards(float $yards): int
    {
        return (int) round(($yards * $this->prix_achat_pagne) / (float) $this->yards_par_pagne);
    }
}
