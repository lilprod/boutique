<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Schema::defaultStringLength(191);

        // Garde-fou : en production, jamais de page d'erreur détaillée, même si APP_DEBUG=true
        // a été laissé par erreur dans le .env (elle exposerait requêtes SQL et configuration).
        if ($this->app->isProduction() && config('app.debug')) {
            config(['app.debug' => false]);
            Log::warning('APP_DEBUG=true ignoré en production : corrigez le fichier .env.');
        }

        // 5 tentatives par minute et par (identifiant + IP) : freine le brute-force du login.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by(strtolower((string) $request->input('identifiant')).'|'.$request->ip()));
    }
}
