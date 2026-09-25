<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vente extends Model
{
    protected $fillable = [
        'numero', 'vendeur_id', 'client_id', 'sous_total', 'remise_type', 'remise_valeur',
        'remise_montant', 'total', 'marge', 'paiement_mode', 'paiement_reference', 'paiement_recu',
        'statut', 'annulation_date', 'annulation_user_id', 'annulation_motif',
    ];

    protected function casts(): array
    {
        return ['remise_valeur' => 'float', 'annulation_date' => 'datetime'];
    }

    public function lignes(): HasMany
    {
        return $this->hasMany(LigneVente::class);
    }

    public function vendeur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendeur_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function numeroAffiche(): string
    {
        return 'V-' . str_pad((string) $this->numero, 5, '0', STR_PAD_LEFT);
    }
}
