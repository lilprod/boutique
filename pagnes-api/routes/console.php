<?php

use App\Models\Client;
use App\Models\Parametre;
use App\Models\Tenant;
use App\Models\User;
use App\Services\FideliteService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/** Remet à zéro les soldes de points des clients sans achat depuis le délai fixé par leur boutique. */
Artisan::command('fidelite:expirer', function (FideliteService $fidelite) {
    $expires = 0;
    $boutiques = Parametre::where('fidelite_active', true)->where('fidelite_expiration_mois', '>', 0)->get();
    foreach ($boutiques as $parametres) {
        Client::where('tenant_id', $parametres->tenant_id)->where('boutique_id', $parametres->boutique_id)
            ->where('points', '>', 0)->select('id')
            ->chunkById(200, function ($clients) use ($fidelite, $parametres, &$expires) {
                foreach ($clients as $c) {
                    DB::transaction(function () use ($c, $fidelite, $parametres, &$expires) {
                        $client = Client::whereKey($c->id)->lockForUpdate()->first();
                        $expires += $client && $fidelite->expirerSiInactif($client, $parametres) ? 1 : 0;
                    });
                }
            });
    }
    $this->info("{$expires} solde(s) de points expiré(s).");
})->purpose('Expire les points de fidélité des clients inactifs');

Schedule::command('fidelite:expirer')->dailyAt('03:00');

/**
 * Crée (ou réinitialise) le compte super administrateur de la plateforme, avec un mot de passe
 * saisi au clavier, jamais écrit dans le code ni dans l'historique du terminal.
 */
Artisan::command('plateforme:super-admin {identifiant} {--nom=Équipe Plateforme}', function (string $identifiant) {
    $motDePasse = $this->secret('Mot de passe (12 caractères au moins)');
    if (mb_strlen((string) $motDePasse) < 12) {
        $this->error('Mot de passe trop court : 12 caractères au moins.');

        return 1;
    }
    if ($this->secret('Confirmez le mot de passe') !== $motDePasse) {
        $this->error('Les deux saisies diffèrent.');

        return 1;
    }

    $user = User::updateOrCreate(['email' => $identifiant], [
        'nom' => $this->option('nom'), 'password' => $motDePasse, 'role' => 'super_admin',
        'actif' => true, 'is_super_admin' => true, 'tenant_id' => null, 'boutique_id' => null,
    ]);
    $user->tokens()->delete();
    $this->info("Super administrateur « {$identifiant} » prêt.");

    return 0;
})->purpose('Crée ou réinitialise le compte super administrateur');

/**
 * À lancer AVANT de déployer les nouvelles règles d'accès (lecture seule, rien n'est modifié) :
 * liste les entreprises dont l'accès change entre l'ancienne règle (abonnement OU licence
 * valable, essai jugé sur ends_at seul) et la nouvelle (Tenant::isActive).
 */
Artisan::command('plateforme:verifier-acces', function () {
    $maintenant = now();
    $ancienAcces = function (Tenant $t) use ($maintenant): bool {
        if ($t->statut !== 'active') {
            return false;
        }
        $abonnement = $t->subscriptions()->whereIn('status', ['active', 'trial'])
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $maintenant))->exists();
        $licence = $t->licenses()->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', $maintenant))->exists();

        return $abonnement || $licence;
    };
    $raison = function (Tenant $t): string {
        $licence = $t->licenses()->latest('id')->first();
        if ($licence?->status === 'suspended') {
            return 'licence suspendue';
        }
        $sub = $t->subscriptions()->latest('starts_at')->latest('id')->first();
        if (! $sub) {
            return 'aucun abonnement et licence non valable';
        }
        if ($sub->status === 'trial') {
            $fin = $sub->trial_ends_at ?? $sub->ends_at;

            return $fin ? 'essai terminé le '.$fin->format('d/m/Y') : 'essai sans date de fin';
        }
        if (in_array($sub->status, ['cancelled', 'expired'], true)) {
            $suite = $licence && $licence->status === 'active' ? ', licence encore active jusqu’au '.($licence->expires_at?->format('d/m/Y') ?? '—') : '';

            return 'abonnement '.($sub->status === 'cancelled' ? 'annulé' : 'expiré').$suite;
        }

        return 'abonnement terminé le '.($sub->ends_at?->format('d/m/Y') ?? '—');
    };

    $perdent = [];
    $gagnent = [];
    foreach (Tenant::orderBy('nom')->get() as $t) {
        $avant = $ancienAcces($t);
        $apres = $t->isActive();
        $ligne = [$t->id, $t->nom, $t->users()->where('actif', true)->count()];
        if ($avant && ! $apres) {
            $perdent[] = [...$ligne, $raison($t)];
        } elseif (! $avant && $apres) {
            $gagnent[] = [...$ligne, 'essai encore en cours (fin d’essai à venir)'];
        }
    }

    $this->info(Tenant::count().' entreprise(s) vérifiée(s).');
    if (! $perdent && ! $gagnent) {
        $this->info('Aucune entreprise ne change d’accès : déploiement sans effet pour les clients.');

        return 0;
    }
    if ($perdent) {
        $this->warn(count($perdent).' entreprise(s) PERDRONT l’accès au déploiement :');
        $this->table(['ID', 'Entreprise', 'Comptes actifs', 'Raison'], $perdent);
    }
    if ($gagnent) {
        $this->warn(count($gagnent).' entreprise(s) RETROUVERONT l’accès au déploiement :');
        $this->table(['ID', 'Entreprise', 'Comptes actifs', 'Raison'], $gagnent);
    }

    return 0;
})->purpose('Liste les entreprises dont l’accès change avec les nouvelles règles (lecture seule)');
