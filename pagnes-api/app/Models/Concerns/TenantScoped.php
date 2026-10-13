<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

trait TenantScoped
{
    public function scopeForCurrentTenant(Builder $query, ?User $user = null): Builder
    {
        if (! $user) {
            return $query;
        }

        if ($user->is_super_admin || empty($user->tenant_id)) {
            return $query->whereRaw('0 = 1');
        }

        // Colonnes qualifiées : la portée reste sûre dans une requête avec jointure.
        return $query->where($query->qualifyColumn('tenant_id'), $user->tenant_id);
    }

    public function scopeForCurrentBoutique(Builder $query, ?User $user = null): Builder
    {
        if (! $user) {
            return $query;
        }

        if (! empty($user->boutique_id)) {
            return $query->where($query->qualifyColumn('boutique_id'), $user->boutique_id);
        }

        return $this->scopeForCurrentTenant($query, $user);
    }

    public function scopeForCurrentContext(Builder $query, ?User $user = null): Builder
    {
        return $query->forCurrentTenant($user)->forCurrentBoutique($user);
    }

    public function belongsToCurrentContext(User $user): bool
    {
        if ($user->is_super_admin) {
            return false;
        }

        if (! $user->tenant_id || (int) $this->tenant_id !== (int) $user->tenant_id) {
            return false;
        }

        return ! $user->boutique_id || (int) $this->boutique_id === (int) $user->boutique_id;
    }
}
