<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * Langue des messages renvoyés par l'API : celle choisie dans l'application, transmise
 * dans l'en-tête X-Langue. Pas Accept-Language, que le navigateur remplit tout seul avec
 * la langue de l'appareil, qui n'est pas forcément celle choisie dans l'application.
 */
class DefinirLangue
{
    public const LANGUES = ['fr', 'en'];

    public function handle(Request $request, Closure $next): Response
    {
        $langue = $request->header('X-Langue');
        // Défaut : la langue de repli, que setLocale() ne modifie pas (contrairement à app.locale,
        // qui garderait la langue d'une requête précédente dans un processus qui dure, ex. Octane).
        App::setLocale(in_array($langue, self::LANGUES, true) ? $langue : config('app.fallback_locale', 'fr'));

        return $next($request);
    }
}
