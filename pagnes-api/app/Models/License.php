<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class License extends Model
{
    protected $fillable = ['tenant_id', 'subscription_id', 'status', 'cle', 'activated_at', 'expires_at', 'quota_usage'];

    protected $casts = [
        'activated_at' => 'datetime',
        'expires_at' => 'datetime',
        'quota_usage' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
