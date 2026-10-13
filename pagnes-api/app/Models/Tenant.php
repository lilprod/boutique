<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Tenant extends Model
{
    protected $fillable = ['nom', 'slug', 'statut'];

    public function boutiques(): HasMany
    {
        return $this->hasMany(Boutique::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function subscription(): HasOne
    {
        return $this->hasOne(Subscription::class)->latestOfMany();
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function licenses(): HasMany
    {
        return $this->hasMany(License::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function activeSubscription(): ?Subscription
    {
        return $this->subscriptions()
            ->whereIn('status', ['active', 'trial'])
            ->where(function ($query) {
                $query->whereNull('ends_at')
                    ->orWhere('ends_at', '>=', now());
            })
            ->latest('starts_at')
            ->first();
    }

    public function activeLicense(): ?License
    {
        return $this->licenses()
            ->where('status', 'active')
            ->where(function ($query) {
                $query->whereNull('expires_at')
                    ->orWhere('expires_at', '>=', now());
            })
            ->latest('activated_at')
            ->first();
    }

    public function isActive(): bool
    {
        if ($this->statut !== 'active') {
            return false;
        }

        return $this->activeSubscription() !== null || $this->activeLicense() !== null;
    }

    public function hasFeature(string $feature): bool
    {
        $subscription = $this->activeSubscription();
        $plan = $subscription?->plan;

        if (! $plan || ! $plan->actif) {
            return false;
        }

        return $plan->hasFeature($feature);
    }

    public function canAddBoutique(): bool
    {
        $subscription = $this->activeSubscription();
        if (! $subscription || ! $subscription->plan || ! $subscription->plan->actif) {
            return false;
        }

        $maxBoutiques = (int) $subscription->plan->max_boutiques;
        $current = $this->boutiques()->count();

        return $current < $maxBoutiques;
    }

    public function canAddUser(): bool
    {
        $subscription = $this->activeSubscription();
        if (! $subscription || ! $subscription->plan || ! $subscription->plan->actif) {
            return false;
        }

        $maxUtilisateurs = (int) $subscription->plan->max_utilisateurs;
        $current = $this->users()->count();

        return $current < $maxUtilisateurs;
    }
}
