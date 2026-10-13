<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    protected $fillable = ['nom', 'slug', 'prix', 'intervalle', 'max_boutiques', 'max_utilisateurs', 'features', 'actif'];

    protected $casts = [
        'prix' => 'integer',
        'max_boutiques' => 'integer',
        'max_utilisateurs' => 'integer',
        'features' => 'array',
        'actif' => 'boolean',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function hasFeature(string $feature): bool
    {
        $features = collect($this->features ?? []);

        return $features->contains(fn ($item) => strtolower((string) $item) === strtolower($feature));
    }
}
