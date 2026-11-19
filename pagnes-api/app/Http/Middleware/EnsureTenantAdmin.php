<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Espace entreprise (abonnement, paiements, factures, clé de licence) : réservé au gérant
 * de l'entreprise. Un vendeur ou un administrateur de boutique n'y a pas accès.
 */
class EnsureTenantAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->is_super_admin || ! $user->tenant_id || ! $user->isTenantAdmin()) {
            abort(403, __('Cet espace est réservé au gérant de l\'entreprise.'));
        }

        return $next($request);
    }
}
