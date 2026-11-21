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

    /**
     * Abonnement en cours. Un abonnement actif sans date de fin reste valable ; un essai,
     * jamais : il lui faut une fin d'essai (ou à défaut une fin d'abonnement) encore à venir.
     */
    public function activeSubscription(): ?Subscription
    {
        return $this->subscriptions()
            ->where(function ($query) {
                $query->where(fn ($q) => $q->where('status', 'active')
                    ->where(fn ($d) => $d->whereNull('ends_at')->orWhere('ends_at', '>=', now())))
                    ->orWhere(fn ($q) => $q->where('status', 'trial')
                        ->whereRaw('COALESCE(trial_ends_at, ends_at) >= ?', [now()]));
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

    /**
     * Accès ouvert ? Une licence suspendue par le super admin coupe l'accès. Dès qu'un abonnement
     * existe, c'est lui qui décide (un abonnement annulé ou expiré ferme l'accès même si la licence
     * court encore) ; la licence seule ne sert que pour un compte sans aucun abonnement.
     */
    public function isActive(): bool
    {
        if ($this->statut !== 'active') {
            return false;
        }

        if ($this->licenses()->latest('id')->value('status') === 'suspended') {
            return false;
        }

        if ($this->subscriptions()->exists()) {
            return $this->activeSubscription() !== null;
        }

        return $this->activeLicense() !== null;
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
        // Comme pour les comptes : une offre retirée du catalogue reste valable pour qui l'a souscrite.
        $subscription = $this->activeSubscription();
        if (! $subscription || ! $subscription->plan) {
            return false;
        }
        if ($subscription->plan->max_boutiques === null) {
            return true;
        }

        $maxBoutiques = (int) $subscription->plan->max_boutiques;
        $current = $this->boutiques()->count();

        return $current < $maxBoutiques;
    }

    public function canAddUser(): bool
    {
        // Une offre retirée du catalogue (plan inactif) reste valable pour qui l'a déjà souscrite.
        $subscription = $this->activeSubscription();
        if (! $subscription || ! $subscription->plan) {
            return false;
        }
        if ($subscription->plan->max_utilisateurs === null) {
            return true;
        }

        $maxUtilisateurs = (int) $subscription->plan->max_utilisateurs;
        // Seuls les comptes actifs occupent une place : désactiver un compte la libère.
        $current = $this->users()->where('actif', true)->count();

        return $current < $maxUtilisateurs;
    }
}
