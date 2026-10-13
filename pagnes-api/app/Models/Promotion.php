<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Promotion extends Model
{
    use TenantScoped;

    protected $fillable = [
        'tenant_id', 'boutique_id', 'nom', 'type_remise', 'valeur', 'cible', 'cible_texte', 'produit_id', 'variante_id',
        'unite', 'quantite_min', 'debut', 'fin', 'actif',
    ];

    protected function casts(): array
    {
        return [
            'valeur' => 'float',
            'quantite_min' => 'float',
            'debut' => 'date:Y-m-d',
            'fin' => 'date:Y-m-d',
            'actif' => 'boolean',
        ];
    }

    /** Promotions actives aujourd'hui (bornes de dates incluses). */
    public function scopeEnCours(Builder $query): Builder
    {
        $jour = now()->toDateString();

        return $query->where('actif', true)
            ->where(fn ($q) => $q->whereNull('debut')->orWhere('debut', '<=', $jour))
            ->where(fn ($q) => $q->whereNull('fin')->orWhere('fin', '>=', $jour));
    }

    /** La ligne (produit, coloris, unité) est-elle visée par cette promotion ? Le seuil de quantité est vérifié à part. */
    public function vise(Produit $produit, Variante $variante, string $unite): bool
    {
        if ($this->unite !== null && $this->unite !== $unite) {
            return false;
        }

        return match ($this->cible) {
            'tout' => true,
            'type' => mb_strtolower(trim((string) $produit->type)) === mb_strtolower(trim((string) $this->cible_texte)),
            'motif' => mb_strtolower(trim((string) $produit->motif)) === mb_strtolower(trim((string) $this->cible_texte)),
            'produit' => (int) $this->produit_id === (int) $produit->id,
            'variante' => (int) $this->variante_id === (int) $variante->id,
            default => false,
        };
    }

    /** Montant retiré à une ligne : un pourcentage du brut, ou un montant par unité vendue, jamais plus que le brut. */
    public function montantPour(int $brut, float $quantite): int
    {
        $montant = $this->type_remise === 'pct'
            ? round($brut * min($this->valeur, 100) / 100)
            : round($this->valeur * $quantite);

        return (int) min($brut, max(0, $montant));
    }
}
