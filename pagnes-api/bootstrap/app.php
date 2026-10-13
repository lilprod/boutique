<?php

use App\Http\Middleware\EnsureActif;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureBoutiqueContext;
use App\Http\Middleware\EnsureSuperAdmin;
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
            'actif' => EnsureActif::class,
            'super_admin' => EnsureSuperAdmin::class,
            'tenant_active' => EnsureTenantActive::class,
        ]);
        // API pure : pas de page de connexion vers laquelle rediriger, un invité reçoit un 401 JSON.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
