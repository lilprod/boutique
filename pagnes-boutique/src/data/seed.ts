import type { CartLine, Client, DB, Mouvement, ModePaiement, Produit, User, Variante, Vente } from '../types';
import { buildLignes, totaux } from '../lib/calc';
import { numeroVente, r2 } from '../lib/format';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const USERS: User[] = [
  { id: 'u_admin', nom: 'Kafui Amegah', identifiant: 'admin', motDePasse: 'admin123', role: 'admin', actif: true },
  { id: 'u_yawovi', nom: 'Yawovi Dossou', identifiant: 'yawovi', motDePasse: 'vente123', role: 'vendeur', actif: true },
  { id: 'u_essenam', nom: 'Essenam Tagba', identifiant: 'essenam', motDePasse: 'vente123', role: 'vendeur', actif: true },
];

// [nom coloris, couleur principale, couleur d'accent]
const COL: [string, string, string][] = [
  ['Orange & indigo', '#E07A1F', '#23306B'], ['Vert émeraude', '#1F8A5B', '#F2C230'], ['Jaune moutarde', '#E2A81B', '#7A2E12'],
  ['Bordeaux', '#8E1F2F', '#F0C36B'], ['Bleu roi', '#1E3FA0', '#F5E6B8'], ['Fuchsia', '#C2185B', '#FFD166'],
  ['Turquoise', '#0E8C8C', '#FBEFD0'], ['Terre & or', '#8A5A2B', '#E5B94E'], ['Noir & or', '#1B1B1B', '#D9A21B'],
  ['Violet', '#5B2A86', '#F5B041'], ['Rouge vif', '#C62828', '#1B1B1B'], ['Blanc cassé', '#F3EAD3', '#2A3A7A'],
];

interface Cat { nom: string; type: string; motif: string; origine: string; prix: number; yards: number; ratio: number; col: number[] }
const CATALOGUE: Cat[] = [
  { nom: 'Wax Hollandais Damier', type: 'Wax', motif: 'Damier', origine: 'Pays-Bas', prix: 38000, yards: 6, ratio: 0.72, col: [0, 1, 4, 8] },
  { nom: 'Wax Hollandais Fleurs de mariage', type: 'Wax', motif: 'Floral', origine: 'Pays-Bas', prix: 42000, yards: 6, ratio: 0.72, col: [3, 5, 6] },
  { nom: 'Wax Vlisco Éventail', type: 'Wax', motif: 'Géométrique', origine: 'Pays-Bas', prix: 68000, yards: 6, ratio: 0.74, col: [4, 7, 9] },
  { nom: 'Wax Vlisco Ballons', type: 'Wax', motif: 'Graphique', origine: 'Pays-Bas', prix: 72000, yards: 6, ratio: 0.74, col: [0, 2, 10] },
  { nom: 'Wax ATL Ghana', type: 'Wax', motif: 'Abstrait', origine: 'Ghana', prix: 24000, yards: 6, ratio: 0.7, col: [1, 2, 5, 6] },
  { nom: 'Kente Ashanti', type: 'Kente', motif: 'Rayures tissées', origine: 'Ghana', prix: 120000, yards: 12, ratio: 0.75, col: [2, 8, 3] },
  { nom: 'Kente Ewé', type: 'Kente', motif: 'Rayures tissées', origine: 'Togo', prix: 95000, yards: 12, ratio: 0.72, col: [1, 4] },
  { nom: 'Bazin Riche brodé', type: 'Bazin', motif: 'Uni brodé', origine: 'Mali', prix: 26000, yards: 5, ratio: 0.7, col: [11, 4, 6, 9] },
  { nom: 'Bazin Getzner', type: 'Bazin', motif: 'Uni', origine: 'Autriche', prix: 32000, yards: 5, ratio: 0.72, col: [11, 3, 7] },
  { nom: 'Bogolan Ségou', type: 'Bogolan', motif: 'Motifs traditionnels', origine: 'Mali', prix: 21000, yards: 6, ratio: 0.68, col: [7, 8] },
  { nom: 'Ankara Classique', type: 'Ankara', motif: 'Floral', origine: 'Nigéria', prix: 15000, yards: 6, ratio: 0.68, col: [0, 5, 6, 1] },
  { nom: 'Ankara Cœurs', type: 'Ankara', motif: 'Cœurs', origine: 'Nigéria', prix: 16500, yards: 6, ratio: 0.68, col: [10, 9, 2] },
  { nom: 'Pagne tissé Baoulé', type: 'Pagne tissé', motif: 'Rayures', origine: "Côte d'Ivoire", prix: 45000, yards: 6, ratio: 0.72, col: [3, 8, 2] },
  { nom: 'Fancy Lomé', type: 'Fancy', motif: 'Floral', origine: 'Togo', prix: 12000, yards: 6, ratio: 0.66, col: [5, 1, 0, 6] },
  { nom: 'Adire Indigo', type: 'Adire', motif: 'Teinture indigo', origine: 'Nigéria', prix: 28000, yards: 6, ratio: 0.7, col: [4, 11] },
];

const NOMS = [
  'Akossiwa Mensah', 'Afi Kokou', 'Ama Tchalla', 'Abla Amouzou', 'Efua Agbodjan', 'Adjoa Lawson', 'Mawuena Ayivi', 'Kossi Dogbé',
  'Yawa Adjovi', 'Ablavi Sossou', 'Dédé Ganyo', 'Enyonam Kpodar', 'Akpéné Gbadamassi', 'Mama Fati Alassani', 'Aïcha Bakary',
  'Sènam Attiogbé', 'Ayaovi Kuma', 'Adjo Agbéko', 'Esso Kondo', 'Elom Tsolenyanu',
];
const QUARTIERS = ['Tokoin', 'Bè', 'Agoè', 'Adidogomé', 'Hédzranawoé', 'Nyékonakpoè', 'Amoutivé', 'Kodjoviakopé', 'Djidjolé', 'Baguida', 'Grand Marché', 'Cacavéli'];

export function seedDb(): DB {
  const R = rng(20260924);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;

  const produits: Produit[] = [];
  const variantes: Variante[] = [];
  const mouvements: Mouvement[] = [];
  let mv = 0;
  const mvId = () => 'm_' + (++mv);

  CATALOGUE.forEach((c, pi) => {
    const id = 'p_' + (pi + 1);
    produits.push({
      id, nom: c.nom, type: c.type, motif: c.motif, origine: c.origine, yardsParPagne: c.yards,
      vendPagne: true, vendYard: true,
      prixPagne: c.prix, prixYard: Math.round((c.prix / c.yards) * 1.2 / 100) * 100, prixAchatPagne: Math.round((c.prix * c.ratio) / 100) * 100,
    });
    const slug = c.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    c.col.forEach((ci, k) => {
      const stock = Math.round(90 + R() * 150);
      const v: Variante = {
        id: `v_${pi + 1}_${k + 1}`, produitId: id, coloris: COL[ci][0], c1: COL[ci][1], c2: COL[ci][2],
        sku: `${slug}-${String(pi + 1).padStart(2, '0')}-${String(ci + 1).padStart(2, '0')}`,
        stock, seuil: Math.round(c.yards * (c.yards >= 12 ? 2 : 3)),
      };
      variantes.push(v);
      mouvements.push({
        id: mvId(), date: new Date(startToday - 62 * DAY + 9 * 3600000 + k * 60000).toISOString(), varianteId: v.id, type: 'entree', yards: stock,
        userId: 'u_admin', motif: 'Stock initial', fournisseur: pick(['Établissements Kponton', 'Vlisco Togo', 'Grossiste Grand Marché', 'Import Tissus Cotonou']),
        prixAchatPagne: Math.round((c.prix * c.ratio) / 100) * 100,
      });
    });
  });

  const clients: Client[] = NOMS.map((nom, i) => ({
    id: 'c_' + (i + 1), nom,
    telephone: `+228 ${pick(['90', '91', '92', '93', '70', '71', '79', '98'])} ${String(10 + Math.floor(R() * 89))} ${String(10 + Math.floor(R() * 89))} ${String(10 + Math.floor(R() * 89))}`,
    adresse: `${pick(QUARTIERS)}, Lomé`, creeLe: new Date(startToday - Math.floor(30 + R() * 90) * DAY).toISOString(),
  }));

  // dates des 60 ventes : 3 aujourd'hui, le reste réparti sur 60 jours
  const dates: number[] = [];
  for (let i = 0; i < 60; i++) {
    if (i < 3) dates.push(startToday + R() * Math.max(60000, now.getTime() - startToday));
    else {
      const d = Math.min(59, Math.floor(Math.pow(R(), 1.15) * 60)) + (i % 7 === 0 ? 1 : 0);
      dates.push(startToday - Math.max(1, d) * DAY + (8 + R() * 11) * 3600000);
    }
  }
  dates.sort((a, b) => a - b);

  const ventes: Vente[] = [];
  const annulees = new Set([18, 41]);
  dates.forEach((t, i) => {
    const numero = i + 1;
    const vendeurId = R() < 0.2 ? 'u_admin' : R() < 0.5 ? 'u_yawovi' : 'u_essenam';
    const nLignes = 1 + (R() < 0.35 ? 1 : 0) + (R() < 0.1 ? 1 : 0);
    const cart: CartLine[] = [];
    for (let j = 0; j < nLignes; j++) {
      const v = pick(variantes.filter(x => x.stock >= 3 && !cart.some(c => c.varianteId === x.id)));
      const p = produits.find(x => x.id === v.produitId)!;
      let unite: 'pagne' | 'yard' = R() < 0.6 ? 'pagne' : 'yard';
      let q = unite === 'pagne' ? pick([1, 1, 1, 2, 2, 3, 0.5]) : pick([1, 2, 3, 3, 4, 5, 6, 8]);
      if (unite === 'pagne' && q * p.yardsParPagne > v.stock) { unite = 'yard'; q = 3; }
      cart.push({ varianteId: v.id, unite, quantite: q, remise: { type: 'pct', valeur: R() < 0.2 ? pick([5, 10]) : 0 } });
    }
    const remise = R() < 0.1 ? (R() < 0.5 ? { type: 'pct' as const, valeur: 5 } : { type: 'fcfa' as const, valeur: pick([1000, 1500, 2000]) }) : { type: 'pct' as const, valeur: 0 };
    const lignes = buildLignes(produits, variantes, cart);
    const tot = totaux(lignes, remise);
    const r = R();
    const mode: ModePaiement = r < 0.4 ? 'especes' : r < 0.62 ? 'flooz' : r < 0.9 ? 'tmoney' : 'carte';
    const reference = mode === 'flooz' ? 'FZ' + Math.floor(1e8 + R() * 9e8) : mode === 'tmoney' ? 'TM' + Math.floor(1e8 + R() * 9e8) : undefined;
    const recu = mode === 'especes' ? Math.ceil(tot.total / (R() < 0.6 ? 5000 : 1000)) * (R() < 0.6 ? 5000 : 1000) : undefined;
    const id = 's_' + numero;
    const date = new Date(t).toISOString();
    const annulee = annulees.has(i);
    ventes.push({
      id, numero, date, vendeurId, clientId: R() < 0.65 ? pick(clients).id : undefined, lignes, sousTotal: tot.sousTotal, remise,
      remiseMontant: tot.remiseMontant, total: tot.total, marge: tot.marge,
      paiement: { mode, reference, recu: recu !== undefined && recu >= tot.total ? recu : undefined },
      statut: annulee ? 'annulee' : 'validee',
      annulation: annulee ? { date: new Date(t + 3600000).toISOString(), userId: 'u_admin', motif: pick(['Erreur de saisie', "Le client a changé d'avis"]) } : undefined,
    });
    for (const l of lignes) {
      mouvements.push({ id: mvId(), date, varianteId: l.varianteId, type: 'vente', yards: -l.yards, userId: vendeurId, motif: 'Vente ' + numeroVente(numero), venteId: id });
      if (annulee) {
        mouvements.push({ id: mvId(), date: new Date(t + 3600000).toISOString(), varianteId: l.varianteId, type: 'annulation', yards: l.yards, userId: 'u_admin', motif: 'Annulation ' + numeroVente(numero), venteId: id });
      } else {
        const v = variantes.find(x => x.id === l.varianteId)!;
        v.stock = r2(v.stock - l.yards);
      }
    }
  });

  // 3 variantes sous le seuil (dont une en rupture)
  [[3, 0.5], [17, 0.85], [29, 0]].forEach(([idx, f]) => {
    const v = variantes[idx % variantes.length];
    const cible = r2(v.seuil * f);
    if (v.stock > cible) {
      mouvements.push({ id: mvId(), date: new Date(now.getTime() - 2 * 3600000).toISOString(), varianteId: v.id, type: 'ajustement', yards: r2(cible - v.stock), userId: 'u_admin', motif: 'Inventaire : coupes abîmées et écart constaté' });
      v.stock = cible;
    }
  });

  return {
    produits, variantes, clients, ventes, mouvements, users: USERS.map(u => ({ ...u })), prochainNumero: ventes.length + 1,
    parametres: {
      boutique: 'Pagnes de Lomé', adresse: 'Grand Marché de Lomé, allée des tissus', telephone: '+228 90 00 00 00',
      ticketFormat: '80mm', remiseMaxVendeur: 15, messageTicket: 'Merci de votre confiance. Les coupes de tissu ne sont ni reprises ni échangées.',
    },
  };
}

export const COLORIS = COL;
export const TYPES = ['Wax', 'Kente', 'Bazin', 'Bogolan', 'Ankara', 'Pagne tissé', 'Fancy', 'Adire', 'Autre'];
