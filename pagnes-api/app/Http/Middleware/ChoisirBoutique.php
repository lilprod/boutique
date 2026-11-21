<?php

namespace App\Http\Middleware;

use App\Models\Boutique;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Boutique de travail du gérant. Un gérant (tenant_admin) peut ouvrir n'importe quelle boutique
 * active de son entreprise : l'interface envoie l'en-tête `X-Boutique: <id>` et, pour cette
 * requête seulement, son compte travaille dans cette boutique. Rien n'est écrit en base : sa
 * boutique de rattachement ne change pas, et deux tablettes peuvent ouvrir deux boutiques.
 *
 * Les autres rôles restent attachés à leur boutique : l'en-tête est ignoré pour eux.
 */
class ChoisirBoutique
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $demande = $request->header('X-Boutique');

        if ($demande !== null && $demande !== '' && $user && ! $user->is_super_admin && $user->tenant_id && $user->isTenantAdmin()) {
            $existe = ctype_digit($demande) && Boutique::query()
                ->where('tenant_id', $user->tenant_id)->whereKey((int) $demande)->where('statut', 'active')->exists();
            abort_unless($existe, 403, __('Cette boutique n’appartient pas à votre entreprise.'));

            // En mémoire seulement : marqué « non modifié » pour qu'un save() éventuel ne l'écrive jamais.
            $user->setAttribute('boutique_id', (int) $demande);
            $user->syncOriginalAttribute('boutique_id');
            $user->unsetRelation('boutique');
        }

        return $next($request);
    }
}
