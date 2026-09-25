<?php

namespace App\Exceptions;

use Exception;

/**
 * Violation d'une règle métier (stock insuffisant, remise trop élevée, motif manquant…).
 * Toujours attrapée par les contrôleurs API et renvoyée en HTTP 422 avec le message
 * tel quel — le frontend l'affiche directement (voir toast(r.error, 'err') côté React).
 */
class RegleMetierException extends Exception
{
}
