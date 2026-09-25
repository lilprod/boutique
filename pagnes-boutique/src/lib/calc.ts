import type { CartLine, LigneVente, Produit, Remise, UniteVente, Variante } from '../types';
import { r2, sum } from './format';

export const yardsOf = (p: Produit, unite: UniteVente, q: number) => r2(unite === 'pagne' ? q * p.yardsParPagne : q);
export const coutYards = (p: Produit, yards: number) => Math.round((yards * p.prixAchatPagne) / p.yardsParPagne);

/** Montant d'une remise appliquée à une base (entier FCFA, jamais supérieur à la base). */
export const remiseMontant = (base: number, r: Remise) => {
  const v = Math.max(0, r.valeur || 0);
  return Math.min(base, r.type === 'pct' ? Math.round((base * Math.min(v, 100)) / 100) : Math.round(v));
};

export function buildLignes(produits: Produit[], variantes: Variante[], cart: CartLine[]): LigneVente[] {
  const out: LigneVente[] = [];
  for (const c of cart) {
    const v = variantes.find(x => x.id === c.varianteId);
    const p = v && produits.find(x => x.id === v.produitId);
    if (!v || !p) continue;
    const prixUnitaire = c.unite === 'pagne' ? p.prixPagne : p.prixYard;
    const brut = Math.round(c.quantite * prixUnitaire);
    const total = brut - remiseMontant(brut, c.remise);
    const yards = yardsOf(p, c.unite, c.quantite);
    out.push({
      varianteId: v.id, produitId: p.id, libelle: p.nom, coloris: v.coloris, unite: c.unite, quantite: c.quantite,
      yards, prixUnitaire, brut, remise: c.remise, total, cout: coutYards(p, yards),
    });
  }
  return out;
}

export function totaux(lignes: LigneVente[], remise: Remise) {
  const brut = sum(lignes.map(l => l.brut));
  const sousTotal = sum(lignes.map(l => l.total));
  const remiseG = remiseMontant(sousTotal, remise);
  const total = sousTotal - remiseG;
  const cout = sum(lignes.map(l => l.cout));
  const remiseEffPct = brut > 0 ? ((brut - total) / brut) * 100 : 0;
  return { brut, sousTotal, remiseMontant: remiseG, total, cout, marge: total - cout, remiseEffPct };
}

export const statutStock = (v: Variante): 'rupture' | 'bas' | 'ok' => (v.stock <= 0 ? 'rupture' : v.stock <= v.seuil ? 'bas' : 'ok');
