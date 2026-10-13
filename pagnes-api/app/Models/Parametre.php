<?php

namespace App\Models;

use App\Models\Concerns\TenantScoped;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Table à une seule ligne. Utiliser Parametre::actuel() plutôt qu'une requête directe. */
class Parametre extends Model
{
    use TenantScoped;

    protected $table = 'parametres';

    protected $fillable = [
        'tenant_id', 'boutique_id', 'boutique', 'adresse', 'telephone', 'ticket_format', 'remise_max_vendeur', 'message_ticket',
        'autorise_pagne', 'autorise_yard', 'autorise_metre', 'quantite_min_panier', 'unite_stock', 'multi_proprietaires',
        'fidelite_active', 'fidelite_tranche', 'fidelite_valeur_point', 'fidelite_seuil', 'fidelite_expiration_mois',
    ];

    protected function casts(): array
    {
        return [
            'autorise_pagne' => 'boolean',
            'autorise_yard' => 'boolean',
            'autorise_metre' => 'boolean',
            'quantite_min_panier' => 'float',
            'multi_proprietaires' => 'boolean',
            'fidelite_active' => 'boolean',
            'fidelite_tranche' => 'integer',
            'fidelite_valeur_point' => 'integer',
            'fidelite_seuil' => 'integer',
            'fidelite_expiration_mois' => 'integer',
        ];
    }

    public function autorise(string $unite): bool
    {
        return match ($unite) {
            'pagne' => $this->autorise_pagne,
            'yard' => $this->autorise_yard,
            'metre' => $this->autorise_metre,
            default => false,
        };
    }

    /** Points gagnés pour un montant payé (tranches complètes). Miroir de lib/calc.ts::pointsGagnes. */
    public function pointsGagnes(int $montantPaye): int
    {
        return $this->fidelite_active && $this->fidelite_tranche > 0 ? intdiv(max(0, $montantPaye), $this->fidelite_tranche) : 0;
    }

    public function remisePourPoints(int $points): int
    {
        return $points * $this->fidelite_valeur_point;
    }

    /** Boutique de gros : seule la vente au pagne est autorisée, c'est le seul cas où le minimum par vente s'applique. */
    public function vendUniquementAuPagne(): bool
    {
        return $this->autorise_pagne && ! $this->autorise_yard && ! $this->autorise_metre;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }

    public static function actuel(?User $user = null): self
    {
        $query = static::query();

        if ($user) {
            $query->forCurrentTenant($user)->forCurrentBoutique($user);
        }

        return $query->firstOrCreate([
            'tenant_id' => $user?->tenant_id,
            'boutique_id' => $user?->boutique_id,
        ], [
            'boutique' => 'Ma boutique', 'ticket_format' => '80mm', 'remise_max_vendeur' => 15,
            // Boutique neuve : pagne seul. Les boutiques existantes gardent pagne + yard (défauts de colonne).
            'autorise_pagne' => true, 'autorise_yard' => false, 'autorise_metre' => false,
            'quantite_min_panier' => 1, 'unite_stock' => 'yard',
        ]);
    }
}
