<?php

use App\Http\Middleware\ChoisirBoutique;
use App\Http\Middleware\DefinirLangue;
use App\Http\Middleware\EnTetesSecurite;
use App\Http\Middleware\EnsureActif;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureBoutiqueContext;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\EnsureTenantAdmin;
use App\Http\Middleware\EnsureTenantActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'admin' => EnsureAdmin::class,
            'boutique_context' => EnsureBoutiqueContext::class,
            'choisir_boutique' => ChoisirBoutique::class,
            'actif' => EnsureActif::class,
            'super_admin' => EnsureSuperAdmin::class,
            'tenant_active' => EnsureTenantActive::class,
            'tenant_admin' => EnsureTenantAdmin::class,
        ]);
        // Avant l'authentification : même un refus de connexion revient dans la langue choisie.
        $middleware->api(prepend: [DefinirLangue::class]);
        // Sur toutes les réponses, y compris les erreurs (401, 403, 422) et la page /up.
        $middleware->append(EnTetesSecurite::class);
        // API pure : pas de page de connexion vers laquelle rediriger, un invité reçoit un 401 JSON.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
