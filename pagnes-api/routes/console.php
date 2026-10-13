<?php

use App\Models\Client;
use App\Models\Parametre;
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
