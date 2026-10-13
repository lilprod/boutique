<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['nom', 'email', 'password', 'role', 'actif', 'tenant_id', 'boutique_id', 'is_super_admin'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'actif' => 'boolean',
            'is_super_admin' => 'boolean',
            'tenant_id' => 'integer',
            'boutique_id' => 'integer',
            'password' => 'hashed',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }

    public function estAdmin(): bool
    {
        return $this->is_super_admin || $this->isTenantAdmin() || $this->isBoutiqueAdmin();
    }

    public function estSuperAdmin(): bool
    {
        return (bool) $this->is_super_admin;
    }

    public function isTenantAdmin(): bool
    {
        return $this->is_super_admin || $this->role === 'admin' || $this->role === 'tenant_admin';
    }

    public function isBoutiqueAdmin(): bool
    {
        return $this->role === 'boutique_admin' || $this->isTenantAdmin();
    }

    public function isVendeur(): bool
    {
        return $this->role === 'vendeur';
    }

    public function roleAlias(): string
    {
        return match ($this->role) {
            'admin' => 'tenant_admin',
            default => (string) $this->role,
        };
    }

    public function canManageTenant(?Tenant $tenant): bool
    {
        if ($this->is_super_admin) {
            return true;
        }

        if (! $tenant || ! $this->tenant_id) {
            return false;
        }

        return (int) $this->tenant_id === (int) $tenant->id && $this->isTenantAdmin();
    }

    public function canManageBoutique(?Boutique $boutique): bool
    {
        if ($this->is_super_admin) {
            return true;
        }

        if (! $boutique || ! $this->boutique_id) {
            return false;
        }

        return (int) $this->boutique_id === (int) $boutique->id && $this->isBoutiqueAdmin();
    }

    public function tenantActif(): bool
    {
        if ($this->is_super_admin) {
            return true;
        }

        if (! $this->tenant) {
            return false;
        }

        return $this->tenant->isActive();
    }
}
