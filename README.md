# Pagnes de Lomé — Gestion de boutique

Application de gestion pour une boutique de pagnes : stock par coloris, caisse, tickets, clients, tableau de bord.
Interface en français, montants en FCFA (entiers), stock en yards.

Le dépôt contient deux applications :

| Dossier | Rôle | Technologies | État |
|---|---|---|---|
| [`pagnes-boutique/`](pagnes-boutique) | Frontend (PWA, tablette d'abord) | React 19, TypeScript, Vite | Fonctionnel, données dans le `localStorage` |
| [`pagnes-api/`](pagnes-api) | API REST | Laravel 13, Sanctum, MySQL | Fonctionnel, testé, pas encore utilisé par le frontend |

> **Le frontend n'appelle pas encore l'API.** Aujourd'hui il tourne seul, avec ses propres données de démonstration.
> Le raccordement (client HTTP, jeton, conversion `snake_case` → `camelCase`) est la prochaine étape : voir [Feuille de route](#feuille-de-route).

## Démarrage rapide

### Frontend

Prérequis : Node.js 18 ou plus.

```bash
cd pagnes-boutique
npm install
npm run dev        # http://localhost:5173
```

Détails (build, PWA, fichier unique hors ligne) : [`pagnes-boutique/README.md`](pagnes-boutique/README.md).

### API

Prérequis : PHP 8.3 ou plus (extensions `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`), Composer, MySQL 8+ ou MariaDB.

```bash
cd pagnes-api
composer install
cp .env.example .env
php artisan key:generate
```

Créez la base, puis renseignez `DB_*` dans `.env` (par défaut `DB_DATABASE=pagnes`, utilisateur `root`) :

```sql
CREATE DATABASE pagnes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
php artisan migrate --seed --seeder="Database\Seeders\DemoSeeder"
php artisan serve  # http://127.0.0.1:8000
```

Le seeder crée 3 comptes, 6 produits (18 coloris), 8 clients et 20 ventes dont quelques annulées. Il ne fait rien si les données existent déjà ; `php artisan migrate:fresh --seed --seeder="Database\Seeders\DemoSeeder"` repart de zéro.

Le `.env.example` fourni est celui de Laravel (SQLite par défaut) : pour MySQL, changez `DB_CONNECTION=mysql` et décommentez `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.

### Tests

```bash
cd pagnes-api
php artisan test
```

Les tests s'exécutent sur MySQL, base `pagnes_test` (voir `phpunit.xml`), à créer une fois :

```sql
CREATE DATABASE pagnes_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `admin123` |
| Vendeur | `yawovi` | `vente123` |
| Vendeur | `essenam` | `vente123` |

Ce sont des comptes de démonstration : ne les gardez pas en production.

## Règles métier

Elles vivent dans `pagnes-api/app/Services/` (et, pour le frontend seul, dans `pagnes-boutique/src/store.tsx`).

- **Unités** : pagne complet (nombre de yards par produit) ou yard au détail. Le stock est tenu en yards.
- **Remises** : par ligne ou sur le total, en % ou en FCFA. Le plafond vendeur (15 % par défaut, réglable) porte sur la remise effective totale, lignes comprises. L'administrateur n'est pas plafonné.
- **Paiement** : espèces, Flooz, T-Money (référence obligatoire), carte.
- **Ventes immuables** : une vente validée ne se modifie pas. Seul l'administrateur l'annule (motif obligatoire) ; le stock est restauré une seule fois.
- **Concurrence** : ventes et annulations verrouillent les lignes concernées dans une transaction (`lockForUpdate`), pour éviter une vente en double du dernier mètre ou un numéro de vente en doublon.
- **Historique** : chaque entrée, vente, annulation et ajustement est journalisé. Un produit déjà vendu ne peut pas être supprimé.

### Droits

| Action | Vendeur | Administrateur |
|---|---|---|
| Voir produits, stock, mouvements, clients | oui | oui |
| Créer une vente, créer ou modifier un client | oui | oui |
| Voir les ventes | les siennes | toutes |
| Voir prix d'achat, marge, coûts | non | oui |
| Créer, modifier, supprimer un produit | non | oui |
| Entrée de stock, ajustement d'inventaire | non | oui |
| Annuler une vente, supprimer un client | non | oui |
| Paramètres, comptes utilisateurs | non | oui |

## API

Authentification par jeton Sanctum : `POST /api/login` renvoie `{ user, token }`, à envoyer ensuite en `Authorization: Bearer <token>`. Les jetons expirent au bout de 12 h, la connexion est limitée à 5 tentatives par minute, et un compte désactivé perd ses jetons.

Les violations de règles métier renvoient `422 { "message": "..." }`, prêt à afficher.

| Domaine | Routes |
|---|---|
| Session | `POST /api/login`, `POST /api/logout`, `GET /api/me` |
| Produits | `GET /api/produits` ; admin : `POST`, `PUT /{id}`, `DELETE /{id}` |
| Stock | `GET /api/mouvements` ; admin : `POST /api/variantes/{id}/entree`, `POST /api/variantes/{id}/ajuster` |
| Clients | `GET`, `POST /api/clients`, `PUT /api/clients/{id}` ; admin : `DELETE /{id}` |
| Ventes | `GET /api/ventes`, `GET /api/ventes/{id}`, `POST /api/ventes` ; admin : `POST /api/ventes/{id}/annuler` |
| Paramètres | `GET /api/parametres` ; admin : `PUT /api/parametres` |
| Utilisateurs | admin : `GET`, `POST /api/users`, `PUT /api/users/{id}` |

## Structure

```
pagnes-boutique/            frontend
  src/pages/                Connexion, Tableau de bord, Caisse, Stock, Ventes, Clients, Paramètres
  src/store.tsx             état global et actions métier (à remplacer par des appels API)
  src/repo.ts               accès aux données (localStorage aujourd'hui)
pagnes-api/                 API Laravel
  app/Services/             règles métier : VenteService, StockService, ProduitService
  app/Http/Controllers/Api/ contrôleurs REST (valident, appellent un service)
  database/migrations/      schéma
  database/seeders/         données de démonstration
  routes/api.php            routes et droits
  tests/Feature/ApiTest.php tests des règles et des droits
```

## Feuille de route

À faire, par ordre de priorité :

1. **Brancher le frontend sur l'API.** `repo.ts` est synchrone alors qu'une API est asynchrone : `store.tsx` est à refaire autour d'un client HTTP avec jeton et conversion `snake_case` → `camelCase`.
2. **Endpoints manquants** : statistiques du tableau de bord (les ventes sont paginées à 50), filtres par date sur les ventes, numéro de vente formaté (`V-00001`) dans le JSON.
3. **Photos produit** : le champ `produits.image` attend un chemin de fichier, mais aucun envoi n'est branché.
4. **Base de données** : contrainte `CHECK (stock >= 0)` (MySQL 8.0.16 ou plus).
5. **Messages de validation Laravel en français** (fichiers de langue absents).
6. **Phase 2 métier** : crédit et acomptes clients, fournisseurs et bons de commande, retours partiels, rapports et exports.
