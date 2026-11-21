# Pagnes de Lomé — API

API REST Laravel 13 (Sanctum, MySQL) de l'application de gestion de boutiques de pagnes. Elle porte les données, les comptes, les droits et toutes les règles métier ; le frontend du dossier [`../pagnes-boutique`](../pagnes-boutique) ne fait que les afficher.

Installation, comptes de démonstration, mise en production, règles métier et liste des routes : voir le [README du dépôt](../README.md).

## En bref

```bash
composer install
cp .env.example .env            # développement ; en production : .env.production.example
php artisan key:generate
php artisan migrate --seed --seeder="Database\Seeders\DemoSeeder"
php artisan serve               # http://127.0.0.1:8000
php artisan test                # base MySQL `pagnes_test`, voir phpunit.xml
```

## Où trouver quoi

| Dossier | Contenu |
|---|---|
| `app/Services/` | Règles métier : `VenteService` (caisse, remises, promotions, points), `StockService`, `ProduitService`, `FideliteService`, `ProprietaireService`, `LicenceService` (renouvellements), `NotificationService` |
| `app/Http/Controllers/Api/` | Contrôleurs REST : ils valident la requête puis appellent un service |
| `app/Http/Middleware/` | `EnsureAdmin`, `EnsureTenantAdmin` (gérant), `EnsureSuperAdmin`, `EnsureTenantActive` (abonnement valable), `EnsureBoutiqueContext`, `EnsureActif`, `DefinirLangue` (`X-Langue`), `EnTetesSecurite` |
| `app/Models/Concerns/TenantScoped.php` | Filtres par entreprise et par boutique ; sans utilisateur, ils ne renvoient rien |
| `routes/api.php` | Routes et droits de chaque espace (boutique, entreprise, super admin) |
| `routes/console.php` | Commandes `plateforme:super-admin`, `plateforme:verifier-acces`, `fidelite:expirer` et leur planification |
| `lang/` | Messages de l'API en français et en anglais |
| `database/seeders/` | Données de démonstration, refusées en production |
| `tests/Feature/` | Tests des règles, des droits, de l'isolation entre entreprises et du cycle d'abonnement |
