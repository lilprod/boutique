<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Refuse les jetons d'un compte désactivé, même s'ils ont été émis avant la désactivation. */
class EnsureActif
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && !$request->user()->actif) {
            abort(401, 'Ce compte est désactivé.');
        }

        return $next($request);
    }
}
