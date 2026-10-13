<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureBoutiqueContext
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        abort_unless($user && ! $user->is_super_admin && $user->tenant_id && $user->boutique_id, 403, 'Aucun contexte boutique associé à ce compte.');

        return $next($request);
    }
}
