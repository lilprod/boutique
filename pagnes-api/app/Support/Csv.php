<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Exports CSV lisibles par Excel en français : UTF-8 avec BOM, séparateur « ; », décimales avec
 * virgule. Écrits au fil de l'eau (pas de fichier entier en mémoire). Une valeur texte qui commence
 * par = + - @ est préfixée d'une apostrophe : Excel ne l'exécute pas comme une formule.
 */
class Csv
{
    /** @param  iterable<array<int, mixed>>  $lignes */
    public static function telecharger(string $nomFichier, array $entetes, iterable $lignes): StreamedResponse
    {
        return response()->streamDownload(function () use ($entetes, $lignes): void {
            $flux = fopen('php://output', 'w');
            fwrite($flux, "\xEF\xBB\xBF");
            fputcsv($flux, $entetes, ';', '"', '\\');
            foreach ($lignes as $ligne) {
                fputcsv($flux, array_map([self::class, 'valeur'], $ligne), ';', '"', '\\');
            }
            fclose($flux);
        }, $nomFichier, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public static function valeur(mixed $v): mixed
    {
        if (is_float($v)) {
            return rtrim(rtrim(number_format($v, 2, ',', ''), '0'), ',');
        }
        if (is_bool($v)) {
            return $v ? __('oui') : __('non');
        }
        if (is_string($v) && preg_match('/^[\x00-\x20]*[=+\-@]/', $v)) {
            return "'".$v;
        }

        return $v;
    }
}
