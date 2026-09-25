<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Bloque les routes réservées à l'administrateur (paramètres, utilisateurs, suppression de produit…). */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->user() || !$request->user()->estAdmin()) {
            abort(403, "Cette action est réservée à l'administrateur.");
        }

        return $next($request);
    }
}
