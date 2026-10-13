<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->estSuperAdmin()) {
            abort(403, 'Cette action est réservée au super administrateur.');
        }

        return $next($request);
    }
}
