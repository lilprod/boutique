<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, __('Authentification requise.'));
        }

        if ($user->is_super_admin) {
            return $next($request);
        }

        if (! $user->tenantActif()) {
            abort(403, __('Le tenant n\'a pas de licence active ou un abonnement valide.'));
        }

        return $next($request);
    }
}
