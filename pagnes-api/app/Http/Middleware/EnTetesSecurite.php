<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * En-têtes de sécurité sur toutes les réponses de l'API. L'API ne sert que du JSON, des fichiers
 * et la facture HTML : la politique de contenu n'autorise que les styles intégrés de la facture
 * et son bouton « Imprimer » (empreinte de `window.print()`), rien d'autre.
 */
class EnTetesSecurite
{
    private const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; "
        ."script-src 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='; "
        ."frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('Content-Security-Policy', self::CSP);
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if ($request->isSecure()) {
            // HTTPS seulement : un navigateur qui l'a vu refuse ensuite le HTTP pendant un an.
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }

        return $response;
    }
}
