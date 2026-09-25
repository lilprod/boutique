# Pagnes de Lomé — Gestion de boutique (Phase 1)

Application de gestion pour une boutique de pagnes : stock par coloris, caisse (POS), tickets imprimables, clients, tableau de bord.
Interface en français, montants en FCFA (entiers), stock en yards (décimal), tablette d'abord.

## Lancer le projet

```bash
npm install
npm run dev        # développement (http://localhost:5173)
npm run build      # production dans dist/ (à héberger en HTTPS pour l'usage hors ligne)
```

Sans réseau, `node build-single.mjs` (esbuild) produit `dist-single/index.html`, un fichier unique qui s'ouvre directement dans le navigateur.

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin` | `admin123` |
| Vendeur | `yawovi` | `vente123` |
| Vendeur | `essenam` | `vente123` |

Données de démo (générées au premier lancement, réinitialisables dans Paramètres) : 15 produits / 47 coloris, 20 clients, 60 ventes sur 60 jours (dont 3 aujourd'hui et 2 annulées), 3 articles sous le seuil dont 1 en rupture.

## Règles métier

- **Unités** : un pagne complet (nombre de yards configurable par produit : 6 par défaut, 12 pour le kente, 5 pour le bazin) ou un yard au détail. Le stock est tenu en yards ; 0,5 pagne = 3 yards.
- **Prix** : prix de vente pagne et yard, prix d'achat au pagne. La marge est calculée à l'instant de la vente et n'est visible que par l'administrateur.
- **Remises** : par ligne ou sur le total, en % ou en FCFA. Le vendeur est plafonné à 15 % (réglable) ; l'administrateur n'a pas de limite.
- **Paiement** : espèces (montant reçu et monnaie rendue), Flooz, T-Money (référence de transaction obligatoire), carte.
- **Ventes immuables** : une vente validée ne se modifie pas. Seul l'administrateur peut l'annuler (motif obligatoire) : le stock est remis à jour et la vente sort du chiffre d'affaires.
- **Mouvements de stock** : chaque entrée, vente, annulation et ajustement est journalisé (date, utilisateur, motif, fournisseur et prix d'achat pour les entrées).

## Architecture

```
src/
  types.ts            modèle de données
  repo.ts             interface Repository + implémentation localStorage (à remplacer par une API en Phase 3)
  store.tsx           état global (Context) + toutes les actions métier et leurs validations
  i18n.ts             tous les textes de l'interface
  lib/                calculs (remises, totaux, marge) et formatage
  data/seed.ts        données de démonstration
  components/         UI commune, graphiques SVG, ticket
  pages/              Connexion, Tableau de bord, Caisse, Stock, Ventes, Clients, Paramètres
public/               manifest PWA, service worker, icône
```

## Écarts par rapport au cahier des charges

- **CSS sur mesure au lieu de Tailwind** : Tailwind en mode navigateur exige une connexion à chaque chargement, ce qui contredit l'usage hors ligne.
- **Graphiques SVG maison au lieu de Recharts**, **routeur par hash au lieu de React Router**, **Context au lieu de Zustand** : moins de dépendances, application plus légère, mêmes fonctions.
- **Hors ligne (PWA)** : le service worker n'est actif que si l'application est servie en HTTPS depuis son propre domaine (pas depuis le fichier unique).
- **TypeScript** : le code est écrit en TypeScript strict mais n'a été compilé qu'avec esbuild ; lancez `npm run build` (qui exécute `tsc`) après `npm install` pour le vérifier.

## Limites connues

- **Sécurité** : les rôles ne sont appliqués que dans l'interface et les mots de passe sont stockés en clair dans le navigateur. Pour une vraie boutique, il faut un serveur d'authentification (Phase 3).
- **Un seul appareil** : les données vivent dans le `localStorage` du navigateur. Deux tablettes ne se synchronisent pas, et vider les données du navigateur efface tout.
- **Photos** : réduites à 360 px et stockées dans le navigateur ; à surveiller si le catalogue grossit (quota d'environ 5 Mo).

## Feuille de route

- **Phase 2** : crédit et acomptes clients, fournisseurs et bons de commande, retours partiels, rapports et exports.
- **Phase 3** : serveur et base de données, synchronisation multi-appareils, authentification réelle.
