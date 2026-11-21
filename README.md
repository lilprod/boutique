# Pagnes de Lomé — Gestion de boutique

Application de gestion pour les boutiques de pagnes, proposée en service par abonnement à plusieurs entreprises. Chaque boutique a son stock par coloris, sa caisse, ses tickets, ses clients et son tableau de bord. S'y ajoutent les promotions, la fidélité et le stock confié par des propriétaires.

Interface en français et en anglais, montants en FCFA (entiers), stock au yard, au pagne ou au mètre selon la boutique.

Le dépôt contient deux applications :

| Dossier | Rôle | Technologies |
|---|---|---|
| [`pagnes-boutique/`](pagnes-boutique) | Frontend (PWA, tablette d'abord) | React 19, TypeScript, Vite |
| [`pagnes-api/`](pagnes-api) | API REST | Laravel 13, Sanctum, MySQL |

Le frontend lit toutes ses données dans l'API, avec un jeton Bearer. Le navigateur ne garde que le jeton, les préférences d'affichage (langue, thème) et la liste des notifications déjà lues. **L'API doit donc tourner avant d'ouvrir le frontend.**

À la connexion, le frontend charge le catalogue, les paramètres et les comptes. Tout ce qui grossit avec l'activité est lu à la demande, filtré et paginé par le serveur : ventes, mouvements de stock, paiements, et clients (la caisse et la page Clients les cherchent dans l'API à chaque frappe). Les statistiques du tableau de bord sont calculées par la base.

## Organisation : plateforme, entreprises, boutiques

- **Plateforme** : le super administrateur crée les entreprises clientes et les formules d'abonnement. Il encaisse les paiements (espèces, carte, T-Money, Flooz) et renouvelle abonnements et licences. Il n'appartient à aucune entreprise.
- **Entreprise** (*tenant*) : elle a un abonnement, une licence et une ou plusieurs boutiques. Son gérant voit l'espace entreprise : abonnement, factures, justificatifs de paiement et clé de licence.
- **Boutique** : toutes les données métier (produits, stock, ventes, clients, paramètres) appartiennent à une boutique et restent invisibles des autres boutiques et des autres entreprises.

L'accès d'une entreprise est ouvert tant que son abonnement est valable :
- un abonnement actif jusqu'à sa date de fin ;
- un essai jusqu'à sa date de fin d'essai.

Un abonnement annulé ou expiré ferme l'accès, même si la licence court encore, tout comme une licence suspendue. La formule limite le nombre de **comptes actifs** : désactiver un compte libère une place.

## Démarrage rapide

Ordre : base de données, puis API, puis frontend.

### API

Prérequis : PHP 8.3 ou plus (extensions `pdo_mysql`, `mbstring`, `openssl`, `fileinfo`), Composer, MySQL 8+ ou MariaDB. Les dépendances sont résolues pour PHP 8.3 (`config.platform` dans `composer.json`) : un `composer update` n'installera aucun paquet qui exige une version plus récente.

```bash
cd pagnes-api
composer install
cp .env.example .env
php artisan key:generate
```

Créez la base :

```sql
CREATE DATABASE pagnes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Le `.env.example` est réglé pour SQLite : pour MySQL, mettez `DB_CONNECTION=mysql` et décommentez `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`. Ensuite :

```bash
php artisan migrate --seed --seeder="Database\Seeders\DemoSeeder"
php artisan serve  # http://127.0.0.1:8000
```

Les données de démonstration comprennent une entreprise et sa boutique, 6 produits (18 coloris), 8 clients et 20 ventes, dont quelques annulées. Elles ajoutent aussi les formules d'abonnement et deux entreprises clientes dont la licence expire bientôt ou a expiré. Relancé sur une base déjà remplie, le seeder n'ajoute que les comptes manquants ; `php artisan migrate:fresh --seed --seeder="Database\Seeders\DemoSeeder"` repart de zéro.

### Frontend

Prérequis : Node.js 18 ou plus.

```bash
cd pagnes-boutique
npm install
npm run dev        # http://127.0.0.1:5173
```

Le frontend appelle l'API à `http://127.0.0.1:8000/api`. Pour une autre adresse, copiez `pagnes-boutique/.env.example` en `.env` et changez `VITE_API_URL`. Côté API, l'origine du frontend doit figurer dans `CORS_ALLOWED_ORIGINS` (`.env`) ; par défaut, `localhost:5173` et `127.0.0.1:5173` sont autorisés.

Sur certains postes, `localhost:5173` est déjà pris par un autre projet : utilisez alors l'adresse `127.0.0.1:5173` affichée par Vite.

Détails (build, PWA) : [`pagnes-boutique/README.md`](pagnes-boutique/README.md).

### Tests

```bash
cd pagnes-api
php artisan test
```

Les 125 tests s’exécutent sur MySQL ou MariaDB, base `pagnes_test` (voir `phpunit.xml`), à créer une fois :

```sql
CREATE DATABASE pagnes_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Ils couvrent les règles de vente et de stock, les droits, l'isolation entre entreprises, le cycle d'abonnement, la fidélité, les promotions, les propriétaires, les notifications, la langue et les garde-fous de production. Côté frontend, `npm run build` vérifie aussi les types TypeScript.

## Comptes de démonstration

| Espace | Rôle | Identifiant | Mot de passe |
|---|---|---|---|
| Plateforme | Super administrateur | `superadmin` | `super123` |
| Entreprise « Pagnes de Lomé » | Gérant | `gerant` | `gerant123` |
| Boutique « Pagnes de Lomé » | Administrateur | `admin` | `admin123` |
| Boutique « Pagnes de Lomé » | Vendeur | `yawovi` | `vente123` |
| Boutique « Pagnes de Lomé » | Vendeur | `essenam` | `vente123` |

Leurs mots de passe sont publics : `DemoSeeder` et `ComptesSaasSeeder` refusent de tourner quand `APP_ENV=production`.

## Mise en production

1. **Configuration** : partez de `pagnes-api/.env.production.example` (copié en `.env`), pas de `.env.example`, qui sert au développement. `APP_DEBUG=false` est obligatoire ; en production, l'API le force de toute façon à `false` et le signale dans le journal.
2. **Base** :
   - Avant de déployer une nouvelle version, lancez `php artisan plateforme:verifier-acces`. Cette commande en lecture seule liste les entreprises dont l'accès changera avec les règles d'abonnement en vigueur.
   - Puis `php artisan migrate --force`, sans seeder. `php artisan db:seed` seul ne crée aucun compte.
3. **Premier compte** : `php artisan plateforme:super-admin <identifiant>` crée le super administrateur. Le mot de passe (12 caractères au moins) se saisit au clavier, jamais en argument. La même commande le réinitialise.
4. **Entreprises** : le super admin crée chaque entreprise avec sa première boutique et le compte de son gérant. Le gérant crée ensuite les autres comptes (8 caractères au moins par mot de passe).
5. **En-têtes de sécurité** :
   - L'API les envoie elle-même : CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, et HSTS en HTTPS.
   - Le frontend est un site statique : configurez sur son serveur web au moins `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` et `Referrer-Policy: strict-origin-when-cross-origin`.
   - Ajoutez-y une CSP qui autorise l'adresse de l'API dans `connect-src` et `img-src` (photos des produits).
6. **HTTPS** obligatoire pour l'API comme pour le frontend : le jeton de connexion circule dans chaque requête.
7. **Tâche planifiée** : `php artisan schedule:run` doit tourner chaque minute (cron). Il lance l'expiration nocturne des points de fidélité (`fidelite:expirer`, 3 h).

## Règles métier

Elles vivent dans `pagnes-api/app/Services/` : c'est le serveur qui fait foi. Le frontend refait les mêmes contrôles de saisie (`pagnes-boutique/src/store.tsx`, `src/lib/calc.ts`) uniquement pour afficher des messages immédiats.

- **Unités** :
  - Chaque boutique choisit ses unités de vente (pagne, yard, mètre) et son unité de stock. Changer l'unité de stock convertit le stock, les seuils et l'historique.
  - Chaque produit indique son nombre de yards par pagne.
  - Une boutique de gros, qui vend au pagne seulement, peut imposer une quantité minimale par vente.
- **Remises** :
  - Par ligne ou sur le total, en % ou en FCFA.
  - Le plafond vendeur (15 % par défaut, réglable) porte sur la remise effective totale, lignes comprises ; l'administrateur n'est pas plafonné.
- **Promotions** : définies par l'administrateur, avec une cible (tout, un type, un motif, un produit, un coloris), une période et une quantité minimale. La caisse applique d'elle-même la plus avantageuse pour chaque ligne, avant la remise manuelle, et ces promotions ne comptent pas dans le plafond vendeur.
- **Fidélité** (à activer par boutique) :
  - Un point gagné par tranche d'achat.
  - Les points s'échangent contre une remise au-delà d'un seuil.
  - Le solde expire après une période d'inactivité.
  - Chaque mouvement de points est tracé, et l'annulation d'une vente rend ou retire les points.
- **Propriétaires** : le stock peut appartenir à plusieurs propriétaires, attribués par produit ou par motif. Le rapport indique ce que chacun a vendu (net encaissé, marge) et ce qui lui reste en stock.
- **Paiement** : espèces (montant reçu et monnaie), Flooz et T-Money (référence obligatoire), carte.
- **Ventes immuables** : une vente validée ne se modifie pas. Seul l'administrateur l'annule, avec un motif obligatoire ; le stock est restauré une seule fois.
- **Concurrence** : ventes et annulations verrouillent les lignes concernées dans une transaction (`lockForUpdate`). Cela évite de vendre deux fois le dernier mètre, d'attribuer deux fois le même numéro de vente ou de dépenser deux fois les mêmes points.
- **Historique** : chaque entrée, vente, annulation et ajustement est journalisé. Un produit déjà vendu ne peut pas être supprimé.

### Rôles et droits

| Action | Vendeur | Admin de boutique | Gérant | Super admin |
|---|---|---|---|---|
| Caisse : créer une vente, créer ou modifier un client | oui | oui | oui | — |
| Voir produits, stock, mouvements, clients, promotions | oui | oui | oui | — |
| Voir les ventes et le tableau de bord | les siennes | toutes | toutes | — |
| Voir prix d'achat, marge, coûts | non | oui | oui | — |
| Produits, entrées de stock, inventaire, promotions, propriétaires | non | oui | oui | — |
| Annuler une vente, supprimer un client, ajuster des points | non | oui | oui | — |
| Paramètres de la boutique | non | oui | oui | — |
| Comptes de la boutique | non | vendeurs et admins de boutique | tous, y compris nommer un gérant | — |
| Espace entreprise (abonnement, factures, clé de licence) | non | non | oui | — |
| Entreprises, formules, paiements, renouvellements | non | non | non | oui |

Personne ne peut attribuer un rôle supérieur au sien. Le dernier administrateur actif d'une boutique ne peut être ni désactivé ni rétrogradé. Le gérant ouvre l'espace boutique depuis son espace entreprise. Le rôle historique `admin` est traité comme un gérant par l'API.

## API

Authentification par jeton Sanctum : `POST /api/login` renvoie `{ user, token }`, à envoyer ensuite en `Authorization: Bearer <token>`.
- Les jetons expirent au bout de 12 h.
- La connexion est limitée à 5 tentatives par minute.
- Un compte désactivé, ou dont le rôle ou le mot de passe change, perd ses jetons.

Les messages de l'API suivent la langue de l'en-tête `X-Langue` (`fr` par défaut, ou `en`). Les violations de règles métier renvoient `422 { "message": "..." }`, prêt à afficher.

**Pagination** :
- Les listes `ventes`, `mouvements` et `clients` sont paginées (`?page=`, `?per_page=`, 200 au plus) au format Laravel (`data`, `current_page`, `last_page`, `total`).
- Les listes de paiements gardent leur forme `{ totals, transactions }` et ajoutent `pagination`.

**Recherche et dates** :
- La recherche `?q=` des ventes porte sur le numéro (`V-00012` ou `12`), le client, le vendeur, l'article, le coloris et la référence de paiement.
- Les « jours » du tableau de bord suivent le fuseau `APP_TIMEZONE` (`Africa/Lome`, UTC+0).

### Espace boutique

| Domaine | Routes |
|---|---|
| Session | `POST /api/login`, `POST /api/logout`, `GET /api/me` |
| Produits | `GET /api/produits` (chaque produit porte `image_url`) ; admin : `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /{id}/image` (multipart, champ `image`), `DELETE /{id}/image` |
| Stock | `GET /api/mouvements` (`?type=`, `?variante_id=`) ; admin : `POST /api/variantes/{id}/entree`, `POST /api/variantes/{id}/ajuster`, `GET /api/fournisseurs` |
| Clients | `GET /api/clients` (paginé, `?q=` : nom, téléphone, y compris sans les espaces, adresse), `GET /api/clients/{id}` (fiche et statistiques), `POST /api/clients`, `PUT /api/clients/{id}`, `GET /api/clients/{id}/points` ; admin : `DELETE /{id}`, `POST /{id}/points` (ajustement avec motif). La liste inclut `achats`, `depense` et `derniere_vente` (ventes validées) |
| Ventes | `GET /api/ventes` (`?q=`, `?statut=`, `?du=`, `?au=`), `GET /api/ventes/{id}`, `POST /api/ventes` ; admin : `POST /api/ventes/{id}/annuler` |
| Promotions | `GET /api/promotions` (en cours pour un vendeur, toutes pour l'admin) ; admin : `POST`, `PUT /{id}`, `DELETE /{id}` |
| Propriétaires | `GET /api/proprietaires` ; admin : `POST`, `PUT /{id}`, `DELETE /{id}`, `GET /api/rapports/proprietaires` (`?du=`, `?au=`) |
| Tableau de bord | `GET /api/tableau-de-bord` : CA et ventes du jour, courbe sur 30 jours, pagnes les plus vendus, dernières ventes ; admin : marge et répartition par vendeur |
| Notifications | `GET /api/notifications` : ruptures, stock bas et, pour l'admin, licence qui expire |
| Paramètres | `GET /api/parametres` ; admin : `PUT /api/parametres` |
| Utilisateurs | admin : `GET`, `POST /api/users`, `PUT /api/users/{id}` |

### Espace entreprise (gérant)

Toutes ces routes commencent par `/api/tenant` :
- `GET /dashboard`, `/boutiques`, `/subscription`, `/plans`, `/notifications` ;
- `GET /payments` (paginé), `/payments/{id}/invoice`, `/payments/{id}/attachment`.

Lecture seule : le renouvellement et les paiements passent par le super admin.

### Console de la plateforme (super admin)

Toutes ces routes commencent par `/api/super-admin` :
- **Tableau de bord** : `GET /dashboard`, `/notifications`.
- **Entreprises** : `GET /tenants`, `POST /tenants` (avec `boutique` et `gerant` facultatifs).
- **Abonnements** : `GET /tenants/{id}/subscription`, `POST /tenants/{id}/subscribe`, `PUT /tenants/{id}/subscription-status`.
- **Encaissement** : `POST /tenants/{id}/renouvellements` (paiement reçu qui prolonge abonnement et licence), `POST /tenants/{id}/payments` (paiement seulement enregistré).
- **Formules** : `GET`, `POST /plans`.
- **Paiements** : `GET /payments` (paginé, filtres `status`, `tenant_id`, `from`, `to`), `/payments/export.csv`, `/payments/{id}/invoice`, `/payments/{id}/attachment`.

### Commandes

| Commande | Rôle |
|---|---|
| `php artisan plateforme:super-admin <identifiant>` | Crée ou réinitialise le super administrateur (mot de passe saisi au clavier) |
| `php artisan plateforme:verifier-acces` | Avant un déploiement : liste les entreprises qui perdront ou retrouveront l'accès (lecture seule) |
| `php artisan fidelite:expirer` | Remet à zéro les points des clients inactifs (planifiée chaque nuit à 3 h) |

### Photos des produits

Les photos sont des fichiers, pas du texte en base. `POST /api/produits/{id}/image` accepte du JPEG, du PNG ou du WebP, de 2 Mo et 4 000 px au plus ; le SVG est refusé. Les fichiers vont dans `pagnes-api/public/photos/produits/` sous un nom aléatoire, et l'API renvoie leur adresse dans `image_url`. Remplacer ou retirer une photo, ou supprimer le produit, efface le fichier.

Ce dossier est ignoré par Git : **il doit être sauvegardé avec la base** et rester accessible en écriture au serveur web. Le `upload_max_filesize` de PHP (2 Mo par défaut) doit rester au moins égal à cette limite de 2 Mo ; le frontend envoie de toute façon des images de 360 px (quelques Ko).

Les justificatifs de paiement (PDF, JPEG, PNG, 10 Mo au plus) sont rangés hors du dossier public, dans `pagnes-api/storage/app/private/payments/`. Ils ne sont servis qu'au super admin et au gérant de l'entreprise concernée, et doivent eux aussi être sauvegardés.

## Structure

```
pagnes-boutique/                frontend
  src/pages/                    Connexion, Tableau de bord, Caisse, Stock, Ventes, Clients, Promotions,
                                Propriétaires, Paramètres, Espace entreprise, Console super admin
  src/api.ts                    client HTTP : jeton Bearer, langue, erreurs, chargement paginé
  src/lib/mappers.ts            conversion API (snake_case, ids numériques) <-> types du frontend
  src/lib/calc.ts               calculs de la caisse (remises, promotions, points), miroir du serveur
  src/store.tsx                 état global chargé depuis l'API, actions métier asynchrones
  src/i18n.ts                   textes de l'interface (français, anglais)
pagnes-api/                     API Laravel
  app/Services/                 règles métier : ventes, stock, produits, fidélité, propriétaires,
                                licences et renouvellements, notifications
  app/Http/Controllers/Api/     contrôleurs REST (valident, appellent un service)
  app/Http/Middleware/          droits (admin, gérant, super admin), accès de l'entreprise, langue,
                                en-têtes de sécurité
  app/Models/Concerns/          TenantScoped : filtre par entreprise et par boutique
  database/migrations/          schéma
  database/seeders/             données de démonstration (refusées en production)
  lang/                         messages de l'API (fr, en)
  routes/api.php                routes et droits
  routes/console.php            commandes artisan et tâches planifiées
  tests/Feature/                tests des règles, des droits, de l'isolation et de l'abonnement
```

## Feuille de route

À faire, par ordre de priorité :

1. **Création de boutiques** : une entreprise n'a pour l'instant que la boutique créée avec elle. Le jour où elle pourra en ajouter, la limite `max_boutiques` de la formule devra être contrôlée.
2. **Base de données** : contrainte `CHECK (stock >= 0)` (MySQL 8.0.16 ou plus).
3. **Hors ligne** : le service worker ne met en cache que l'application, pas les données, volontairement, car elles sont confidentielles. La caisse ne fonctionne donc pas sans réseau.
4. **Phase 2 métier** : crédit et acomptes clients, fournisseurs et bons de commande, retours partiels, rapports et exports.
