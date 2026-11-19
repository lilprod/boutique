<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * `php artisan db:seed` sans --class ne crée aucun compte : un compte au mot de passe connu
 * n'a rien à faire sur une base réelle. Données de démo : --seeder="Database\Seeders\DemoSeeder"
 * (refusé en production). Premier super administrateur : php artisan plateforme:super-admin.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->info('Aucune donnée créée. Démo : --seeder="Database\\Seeders\\DemoSeeder" ; super admin : php artisan plateforme:super-admin');
    }
}
