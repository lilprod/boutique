# Pagnes de Lomé — Frontend

Application de gestion pour une boutique de pagnes : stock par coloris, caisse (POS), tickets imprimables, clients, tableau de bord.
Interface en français, montants en FCFA (entiers), stock en yards (décimal), tablette d'abord.

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

Fournis par le jeu de données de l'API (`php artisan migrate --seed --seeder="Database\Seeders\DemoSeeder"`) et proposés sur l'écran de connexion **en développement seulement** (masqués dans le build de production).

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `admin123` |
| Vendeur | `yawovi` | `vente123` |
| Vendeur | `essenam` | `vente123` |

## Règles métier

Le serveur fait foi ; le frontend refait les contrôles de saisie pour répondre tout de suite, en français.

- **Unités** : un pagne complet (nombre de yards configurable par produit : 6 par défaut, 12 pour le kente, 5 pour le bazin) ou un yard au détail. Le stock est tenu en yards ; 0,5 pagne = 3 yards.
- **Prix** : prix de vente pagne et yard, prix d'achat au pagne. La marge est calculée à l'instant de la vente ; prix d'achat et marge ne sont envoyés qu'à l'administrateur.
- **Remises** : par ligne ou sur le total, en % ou en FCFA. Le vendeur est plafonné à 15 % (réglable) sur la remise effective totale ; l'administrateur n'a pas de limite.
- **Paiement** : espèces (montant reçu et monnaie rendue), Flooz, T-Money (référence de transaction obligatoire), carte.
- **Ventes immuables** : une vente validée ne se modifie pas. Seul l'administrateur peut l'annuler (motif obligatoire) : le stock est remis à jour et la vente sort du chiffre d'affaires.
- **Mouvements de stock** : chaque entrée, vente, annulation et ajustement est journalisé (date, utilisateur, motif, fournisseur et prix d'achat pour les entrées).
- **Session** : le jeton est conservé dans le `localStorage` et expire au bout de 12 h ; à l'expiration, ou si le compte est désactivé, l'application revient à la connexion.
- **Vendeur** : ne voit que ses propres ventes, n'a pas accès aux paramètres ni à la liste des comptes.

## Architecture

```
src/
  types.ts            modèle de données
  api.ts              client HTTP : jeton Bearer, erreurs normalisées, chargement paginé
  lib/mappers.ts      conversion API (snake_case, ids numériques) <-> types du frontend
  store.tsx           état global (Context) chargé depuis l'API ; actions métier asynchrones
  i18n.ts             tous les textes de l'interface
  lib/                calculs (remises, totaux, marge) et formatage
  data/catalogue.ts   suggestions de coloris et de types du formulaire produit
  components/         UI commune, graphiques SVG, ticket
  pages/              Connexion, Tableau de bord, Caisse, Stock, Ventes, Clients, Paramètres
public/               manifest PWA, service worker, icône
```

Les actions de `store.tsx` renvoient une promesse de `{ ok, error?, data? }` : les pages affichent `error` tel quel (message français du serveur). Après chaque modification, les données touchées sont rechargées depuis l'API.

## Écarts par rapport au cahier des charges

- **CSS sur mesure au lieu de Tailwind**, **graphiques SVG maison au lieu de Recharts**, **routeur par hash au lieu de React Router**, **Context au lieu de Zustand** : moins de dépendances, application plus légère, mêmes fonctions.
- **PWA** : le service worker met en cache l'application (pas les données de l'API) et n'est actif que si elle est servie en HTTPS depuis son propre domaine. La caisse nécessite le réseau.
- **Le fichier unique** `build-single.mjs` (`dist-single/index.html`, ouvert sans serveur) ne convient plus : sans API, il n'affiche que l'écran de connexion.

## Limites connues

- **Tableau de bord** : les agrégats sont calculés dans le navigateur à partir de tout l'historique des ventes, rechargé à chaque connexion. À terme, des statistiques côté serveur seront nécessaires.
- **Photos** : réduites à 360 px, envoyées en `data:` URL et renvoyées avec chaque chargement du catalogue ; à remplacer par un envoi de fichier si le catalogue grossit.
- **Jeton dans le `localStorage`** : lisible par tout script de la page ; la protection repose sur l'absence de contenu tiers et sur l'expiration à 12 h.
- **Messages d'erreur génériques** de validation Laravel en anglais (rares : les contrôles de saisie du frontend les devancent).
