<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    protected $fillable = ['nom', 'telephone', 'adresse'];

    public function ventes(): HasMany
    {
        return $this->hasMany(Vente::class);
    }
}
