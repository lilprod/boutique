<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    protected $fillable = ['tenant_id', 'plan_id', 'status', 'starts_at', 'ends_at', 'trial_ends_at', 'billing_provider', 'external_reference'];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'trial_ends_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function licenses(): HasMany
    {
        return $this->hasMany(License::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
