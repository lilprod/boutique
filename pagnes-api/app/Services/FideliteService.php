<?php

namespace App\Services;

use App\Exceptions\RegleMetierException;
use App\Models\Client;
use App\Models\MouvementPoints;
use App\Models\Parametre;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Seul point d'entrée qui fait varier le solde de points d'un client : chaque variation est tracée. */
class FideliteService
{
    /** À appeler dans une transaction, la ligne du client étant verrouillée. */
    public function mouvement(Client $client, string $type, int $points, ?Vente $vente, ?User $par, ?string $motif = null): void
    {
        if ($points === 0) {
            return;
        }
        $client->increment('points', $points);
        MouvementPoints::create([
            'tenant_id' => $client->tenant_id, 'boutique_id' => $client->boutique_id, 'client_id' => $client->id,
            'vente_id' => $vente?->id, 'type' => $type, 'points' => $points, 'motif' => $motif, 'user_id' => $par?->id,
        ]);
    }

    /**
     * Remet le solde à zéro si le client n'a fait aucun achat (ni reçu d'ajustement) depuis
     * `fidelite_expiration_mois` mois. À appeler, ligne du client verrouillée, avant d'utiliser
     * ses points ; la commande fidelite:expirer le fait aussi chaque nuit pour toute la boutique.
     */
    public function expirerSiInactif(Client $client, Parametre $parametres): bool
    {
        $mois = $parametres->fidelite_expiration_mois;
        if (! $parametres->fidelite_active || $mois <= 0 || $client->points <= 0) {
            return false;
        }
        $derniereActivite = collect([
            Vente::where('client_id', $client->id)->where('statut', 'validee')->max('created_at'),
            MouvementPoints::where('client_id', $client->id)->where('type', 'ajustement')->max('created_at'),
        ])->filter()->map(fn ($d) => Carbon::parse($d))->max();

        if ($derniereActivite && $derniereActivite->greaterThan(now()->subMonthsNoOverflow($mois))) {
            return false;
        }
        $this->mouvement($client, 'expiration', -$client->points, null, null, sprintf('Aucun achat depuis %d mois', $mois));

        return true;
    }

    /** Correction manuelle par l'administrateur (geste commercial, erreur de saisie…). */
    public function ajuster(Client $client, int $points, string $motif, User $par): Client
    {
        if ($points === 0) {
            throw new RegleMetierException('Indiquez un nombre de points à ajouter ou à retirer.');
        }
        if (trim($motif) === '') {
            throw new RegleMetierException('Le motif est obligatoire.');
        }

        return DB::transaction(function () use ($client, $points, $motif, $par) {
            $client = Client::whereKey($client->id)->lockForUpdate()->firstOrFail();
            $this->mouvement($client, 'ajustement', $points, null, $par, trim($motif));

            return $client->refresh();
        });
    }
}
