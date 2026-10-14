<?php

namespace App\Exceptions;

use Exception;

/**
 * Violation d'une règle métier (stock insuffisant, remise trop élevée, motif manquant…).
 * Toujours attrapée par les contrôleurs API et renvoyée en HTTP 422 avec le message
 * tel quel — le frontend l'affiche directement (voir toast(r.error, 'err') côté React).
 *
 * Le message est écrit en français et traduit dans la langue de la requête (lang/en.json,
 * voir le middleware DefinirLangue) ; les valeurs variables passent par des marqueurs :nom.
 */
class RegleMetierException extends Exception
{
    public function __construct(string $message, array $remplacements = [])
    {
        parent::__construct(__($message, $remplacements));
    }
}
