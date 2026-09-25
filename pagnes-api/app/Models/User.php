<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable;

    protected $fillable = ['nom', 'email', 'password', 'role', 'actif'];
    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['actif' => 'boolean', 'password' => 'hashed'];
    }

    public function estAdmin(): bool
    {
        return $this->role === 'admin';
    }
}
