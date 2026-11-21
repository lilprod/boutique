# Pagnes de Lomé — Frontend

Application de gestion pour une boutique de pagnes : stock par coloris, caisse (POS), tickets imprimables, clients, tableau de bord.
Interface en français et en anglais, montants en FCFA (entiers), stock au yard, au pagne ou au mètre selon la boutique, tablette d'abord. Elle réunit trois espaces : la boutique (caisse, stock, ventes, clients), l'espace entreprise du gérant et la console du super admin.

Elle s'appuie sur l'API Laravel du dossier [`../pagnes-api`](../pagnes-api) : les données, les comptes et les règles métier sont côté serveur. Voir le [README du dépôt](../README.md) pour l'ensemble.

## Lancer le projet

Démarrez d'abord l'API (voir le README du dépôt), puis :

```bash
npm install
npm run dev        # développement (http://127.0.0.1:5173)
npm run build      # vérification TypeScript + production dans dist/ (à héberger en HTTPS)
```

L'adresse de l'API se règle avec `VITE_API_URL` (copiez `.env.example` en `.env`) ; par défaut `http://127.0.0.1:8000/api`. L'origine du frontend doit être autorisée côté API (`CORS_ALLOWED_ORIGINS`).

## Comptes de démonstration

Fournis par le jeu de données de l'API (`php artisan migrate --seed --seeder="Database\Seeders\DemoSeeder"`). L'écran de connexion propose les comptes `admin` et `yawovi` en un clic, **en développement seulement** : ils sont masqués dans le build de production.

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Super administrateur | `superadmin` | `super123` |
| Gérant de l'entreprise | `gerant` | `gerant123` |
| Administrateur de boutique | `admin` | `admin123` |
| Vendeur | `yawovi` | `vente123` |
| Vendeur | `essenam` | `vente123` |

## Règles métier

Le serveur fait foi ; le frontend refait les contrôles de saisie pour répondre tout de suite, en français.

- **Unités** : la boutique choisit ce qu'elle vend (pagne complet, yard, mètre) et l'unité de son stock. Le nombre de yards par pagne se règle par produit : 6 par défaut, 12 pour le kente, 5 pour le bazin.
- **Prix** : prix de vente pagne et yard, prix d'achat au pagne. La marge est calculée à l'instant de la vente ; prix d'achat et marge ne sont envoyés qu'à l'administrateur.
- **Remises** : par ligne ou sur le total, en % ou en FCFA. Le vendeur est plafonné à 15 % (réglable) sur la remise effective totale ; l'administrateur n'a pas de limite.
- **Promotions et fidélité** : la caisse applique d'elle-même la promotion la plus avantageuse par ligne. Elle propose aussi au client d'échanger ses points contre une remise.
- **Paiement** : espèces (montant reçu et monnaie rendue), Flooz, T-Money (référence de transaction obligatoire), carte.
- **Ventes immuables** : une vente validée ne se modifie pas. Seul l'administrateur peut l'annuler (motif obligatoire) : le stock est remis à jour et la vente sort du chiffre d'affaires.
- **Mouvements de stock** : chaque entrée, vente, annulation et ajustement est journalisé (date, utilisateur, motif, fournisseur et prix d'achat pour les entrées).
- **Session** : le jeton est conservé dans le `localStorage` et expire au bout de 12 h ; à l'expiration, ou si le compte est désactivé, l'application revient à la connexion.
- **Vendeur** : ne voit que ses propres ventes, n'a pas accès aux paramètres ni à la liste des comptes.
- **Gérant** : arrive sur l'espace entreprise (abonnement, factures, clé de licence) et ouvre l'espace boutique d'un clic. **Super admin** : arrive sur la console de la plateforme. Le détail des droits est dans le [README du dépôt](../README.md#rôles-et-droits).

## Architecture

```
src/
  types.ts            modèle de données
  api.ts              client HTTP : jeton Bearer, erreurs normalisées, chargement paginé
  lib/mappers.ts      conversion API (snake_case, ids numériques) <-> types du frontend
  store.tsx           état global (Context) : produits, clients, paramètres, comptes ; actions métier asynchrones
  lib/usePaged.ts     lecture paginée à la demande (ventes, mouvements) ; lib/useFetch.ts : lecture simple (tableau de bord)
  i18n.ts             tous les textes de l'interface (français, anglais)
  lib/                calculs (remises, totaux, marge) et formatage
  data/catalogue.ts   suggestions de coloris et de types du formulaire produit
  components/         UI commune, graphiques SVG, ticket
  pages/              Connexion, Tableau de bord, Caisse, Stock, Ventes, Clients, Promotions, Propriétaires,
                      Paramètres, Espace entreprise (TenantPortal), Console super admin (SuperAdminDashboard)
public/               manifest PWA, service worker, icône
```

Les actions de `store.tsx` renvoient une promesse de `{ ok, error?, data? }` : les pages affichent `error` tel quel (message du serveur, dans la langue choisie). Après chaque modification, les données touchées sont rechargées depuis l'API.

Le chargement à la connexion ne dépend pas de la taille de l'historique : les ventes (recherche, statut, dates), les mouvements de stock (type, coloris) et les statistiques du tableau de bord sont lus à la demande, filtrés et paginés par le serveur. Les clients sont chargés page par page, et leurs statistiques (achats, dépense, dernier achat) viennent de cette liste. Les paiements de l'espace entreprise et de la console sont paginés, avec « Afficher plus ».

## Écarts par rapport au cahier des charges

- **CSS sur mesure au lieu de Tailwind**, **graphiques SVG maison au lieu de Recharts**, **routeur par hash au lieu de React Router**, **Context au lieu de Zustand** : moins de dépendances, application plus légère, mêmes fonctions.
- **PWA** : le service worker met en cache l'application (pas les données de l'API) et n'est actif que si elle est servie en HTTPS depuis son propre domaine. La caisse nécessite le réseau.
- **Le fichier unique** `build-single.mjs` (`dist-single/index.html`, ouvert sans serveur) ne convient plus : sans API, il n'affiche que l'écran de connexion.

## Limites connues

- **Tableau de bord** : fenêtre fixe de 30 jours ; pas encore de période au choix.
- **Photos** : réduites à 360 px et ré-encodées en JPEG par le navigateur, puis envoyées comme fichier à l'API (`POST /produits/{id}/image`) après l'enregistrement du produit. Si l'envoi échoue, le produit reste enregistré et un message le signale ; rouvrez le produit pour renvoyer la photo.
- **Jeton dans le `localStorage`** : lisible par tout script de la page ; la protection repose sur l'absence de contenu tiers, sur l'expiration à 12 h et sur les en-têtes de sécurité du serveur web (voir « Mise en production » dans le README du dépôt).
- **Clients** : tous sont chargés au démarrage, page par page ; une recherche côté serveur reste à faire pour les gros fichiers clients.
