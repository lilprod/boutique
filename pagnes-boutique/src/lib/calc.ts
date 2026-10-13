import type { CartLine, Client, LigneVente, Parametres, Produit, Promotion, Remise, UniteVente, Variante } from '../types';
import { r2, sum } from './format';

/* Miroir de App\Models\Produit (versYards, depuisYards, quantitePour) : les deux doivent rester identiques. */
export const YARD_EN_METRES = 0.9144;
/** Ordre de préférence : unité proposée par défaut à la caisse. */
export const UNITES: UniteVente[] = ['pagne', 'yard', 'metre'];

const versYards = (p: Produit, unite: UniteVente, q: number) =>
  unite === 'pagne' ? q * p.yardsParPagne : unite === 'metre' ? q / YARD_EN_METRES : q;
const depuisYards = (p: Produit, unite: UniteVente, yards: number) =>
  unite === 'pagne' ? yards / p.yardsParPagne : unite === 'metre' ? yards * YARD_EN_METRES : yards;

/** Yards correspondant à une quantité : sert au calcul du coût, indépendamment de l'unité de stock. */
export const yardsOf = (p: Produit, unite: UniteVente, q: number) => r2(versYards(p, unite, q));
/** Quantité dans l'unité de stock de la boutique. */
export const quantitePour = (p: Produit, unite: UniteVente, q: number, uniteStock: UniteVente) => r2(depuisYards(p, uniteStock, versYards(p, unite, q)));
export const coutYards = (p: Produit, yards: number) => Math.round((yards * p.prixAchatPagne) / p.yardsParPagne);

export const prixUnitaire = (p: Produit, unite: UniteVente) => (unite === 'pagne' ? p.prixPagne : unite === 'metre' ? p.prixMetre : p.prixYard);
export const vendAu = (p: Produit, unite: UniteVente) => (unite === 'pagne' ? p.vendPagne : unite === 'metre' ? p.vendMetre : p.vendYard);
export const autorise = (params: Parametres, unite: UniteVente) =>
  unite === 'pagne' ? params.autorisePagne : unite === 'metre' ? params.autoriseMetre : params.autoriseYard;
/** Unités proposées à la caisse : vendues par le produit ET autorisées par la boutique. */
export const unitesVendables = (p: Produit, params: Parametres) => UNITES.filter(u => vendAu(p, u) && autorise(params, u));
/** Grossiste : seule la vente au pagne est autorisée ; c'est le seul cas où le minimum par vente s'applique. */
export const pagneSeul = (params: Parametres) => params.autorisePagne && !params.autoriseYard && !params.autoriseMetre;
/** Vrai si le panier d'une boutique pagne seul n'atteint pas la quantité minimale par vente. */
export const minimumNonAtteint = (params: Parametres, cart: CartLine[]) =>
  pagneSeul(params) && cart.length > 0 && sum(cart.map(c => c.quantite)) + 0.001 < params.quantiteMinPanier;

/** Montant d'une remise appliquée à une base (entier FCFA, jamais supérieur à la base). */
export const remiseMontant = (base: number, r: Remise) => {
  const v = Math.max(0, r.valeur || 0);
  return Math.min(base, r.type === 'pct' ? Math.round((base * Math.min(v, 100)) / 100) : Math.round(v));
};

/* ---------- Promotions : miroir de App\Models\Promotion et VenteService::meilleuresPromotions ---------- */
const jourLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const egal = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Active aujourd'hui, bornes incluses. */
export const enCours = (pr: Promotion, jour = jourLocal()) => pr.actif && (!pr.debut || pr.debut <= jour) && (!pr.fin || pr.fin >= jour);

/** La ligne est-elle visée ? (le seuil de quantité se vérifie sur le panier, à part). */
export const vise = (pr: Promotion, p: Produit, v: Variante, unite: UniteVente) =>
  (!pr.unite || pr.unite === unite) && (
    pr.cible === 'tout'
    || (pr.cible === 'type' && egal(p.type, pr.cibleTexte))
    || (pr.cible === 'motif' && egal(p.motif, pr.cibleTexte))
    || (pr.cible === 'produit' && pr.produitId === p.id)
    || (pr.cible === 'variante' && pr.varianteId === v.id));

/** Pourcentage du brut, ou montant par unité vendue ; jamais plus que le brut. */
export const montantPromo = (pr: Promotion, brut: number, quantite: number) =>
  Math.min(brut, Math.max(0, pr.typeRemise === 'pct' ? Math.round((brut * Math.min(pr.valeur, 100)) / 100) : Math.round(pr.valeur * quantite)));

interface LigneBrute { p: Produit; v: Variante; unite: UniteVente; quantite: number; brut: number }

/** Pour chaque ligne (par index), la promotion en cours qui lui retire le plus. Ordre d'examen : identifiant croissant, comme le serveur. */
export function meilleuresPromotions(promotions: Promotion[], lignes: LigneBrute[]): ({ promo: Promotion; montant: number } | undefined)[] {
  const choix: ({ promo: Promotion; montant: number } | undefined)[] = lignes.map(() => undefined);
  for (const pr of [...promotions].filter(x => enCours(x)).sort((a, b) => Number(a.id) - Number(b.id))) {
    const visees = lignes.map((l, i) => [l, i] as const).filter(([l]) => vise(pr, l.p, l.v, l.unite));
    if (visees.length === 0 || sum(visees.map(([l]) => l.quantite)) + 0.001 < pr.quantiteMin) continue;
    for (const [l, i] of visees) {
      const montant = montantPromo(pr, l.brut, l.quantite);
      if (montant > (choix[i]?.montant ?? 0)) choix[i] = { promo: pr, montant };
    }
  }
  return choix;
}

export function buildLignes(produits: Produit[], variantes: Variante[], cart: CartLine[], uniteStock: UniteVente, promotions: Promotion[] = []): LigneVente[] {
  const bruts: (LigneBrute & { c: CartLine; pu: number })[] = [];
  for (const c of cart) {
    const v = variantes.find(x => x.id === c.varianteId);
    const p = v && produits.find(x => x.id === v.produitId);
    if (!v || !p) continue;
    const pu = prixUnitaire(p, c.unite);
    bruts.push({ c, p, v, pu, unite: c.unite, quantite: c.quantite, brut: Math.round(c.quantite * pu) });
  }
  // Promotion d'abord, puis la remise manuelle sur ce qui reste (comme VenteService).
  const promos = meilleuresPromotions(promotions, bruts);
  return bruts.map(({ c, p, v, pu, brut }, i) => {
    const remisePromo = promos[i]?.montant ?? 0;
    const base = brut - remisePromo;
    const yards = yardsOf(p, c.unite, c.quantite);
    return {
      varianteId: v.id, produitId: p.id, libelle: p.nom, coloris: v.coloris, unite: c.unite, quantite: c.quantite,
      yards, quantiteStock: quantitePour(p, c.unite, c.quantite, uniteStock), prixUnitaire: pu, brut, remise: c.remise,
      promotionId: promos[i]?.promo.id, promotionLibelle: promos[i]?.promo.nom, remisePromo,
      total: base - remiseMontant(base, c.remise), cout: coutYards(p, yards),
    };
  });
}

export function totaux(lignes: LigneVente[], remise: Remise) {
  const brut = sum(lignes.map(l => l.brut));
  const promotions = sum(lignes.map(l => l.remisePromo ?? 0));
  const sousTotal = sum(lignes.map(l => l.total));
  const remiseG = remiseMontant(sousTotal, remise);
  const total = sousTotal - remiseG;
  const cout = sum(lignes.map(l => l.cout));
  // Le plafond du vendeur porte sur ses remises, pas sur les promotions décidées par l'administrateur.
  const base = brut - promotions;
  const remiseEffPct = base > 0 ? ((base - total) / base) * 100 : 0;
  return { brut, promotions, sousTotal, remiseMontant: remiseG, total, cout, marge: total - cout, remiseEffPct };
}

/* ---------- Fidélité : miroir de Parametre::pointsGagnes / remisePourPoints et des contrôles de VenteService ---------- */
export const pointsGagnes = (params: Parametres, montantPaye: number) =>
  params.fideliteActive && params.fideliteTranche > 0 ? Math.floor(Math.max(0, montantPaye) / params.fideliteTranche) : 0;
export const remisePoints = (params: Parametres, points: number) => Math.max(0, Math.round(points)) * params.fideliteValeurPoint;
/** Points utilisables au plus sur ce ticket : limités par le solde du client et par le montant à payer. */
export const pointsMax = (params: Parametres, solde: number, totalAvantPoints: number) =>
  Math.max(0, Math.min(solde, params.fideliteValeurPoint > 0 ? Math.floor(totalAvantPoints / params.fideliteValeurPoint) : 0));
/** Raison (clé i18n et variables) pour laquelle ces points ne peuvent pas être utilisés, ou null. */
export function refusPoints(params: Parametres, client: Client | undefined, points: number, totalAvantPoints: number): { cle: string; vars?: Record<string, string> } | null {
  if (points <= 0) return null;
  if (!params.fideliteActive) return { cle: 'err.fideliteInactive' };
  if (!client) return { cle: 'err.pointsSansClient' };
  if (points < params.fideliteSeuil) return { cle: 'err.pointsSeuil', vars: { n: String(params.fideliteSeuil) } };
  if (points > client.points) return { cle: 'err.pointsSolde', vars: { nom: client.nom, n: String(Math.max(0, client.points)) } };
  if (remisePoints(params, points) > totalAvantPoints) return { cle: 'err.pointsTrop', vars: { n: String(pointsMax(params, Infinity, totalAvantPoints)) } };
  return null;
}

export const statutStock =(v: Variante): 'rupture' | 'bas' | 'ok' => (v.stock <= 0 ? 'rupture' : v.stock <= v.seuil ? 'bas' : 'ok');
