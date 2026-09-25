<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Table à une seule ligne. Utiliser Parametre::actuel() plutôt qu'une requête directe. */
class Parametre extends Model
{
    protected $table = 'parametres';
    protected $fillable = ['boutique', 'adresse', 'telephone', 'ticket_format', 'remise_max_vendeur', 'message_ticket'];

    public static function actuel(): self
    {
        return static::firstOrCreate(['id' => 1], [
            'boutique' => 'Ma boutique', 'ticket_format' => '80mm', 'remise_max_vendeur' => 15,
        ]);
    }
}
