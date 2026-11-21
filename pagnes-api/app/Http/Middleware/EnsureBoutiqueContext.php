<?php

namespace App\Http\Middleware;

use App\Models\Boutique;
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

        abort_unless($user && ! $user->is_super_admin && $user->tenant_id && $user->boutique_id, 403, __('Aucun contexte boutique associé à ce compte.'));
        // Boutique fermée par le gérant : plus aucune lecture ni vente (données conservées, réouverture possible).
        abort_unless(
            Boutique::whereKey($user->boutique_id)->where('tenant_id', $user->tenant_id)->where('statut', 'active')->exists(),
            403, __('Cette boutique est fermée.')
        );

        return $next($request);
    }
}
