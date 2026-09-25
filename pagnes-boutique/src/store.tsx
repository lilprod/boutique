import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, Client, DB, ModePaiement, Mouvement, Parametres, Produit, Remise, Res, Role, UniteVente, User, Variante, Vente } from './types';
import { localRepo as repo } from './repo';
import { seedDb } from './data/seed';
import { buildLignes, totaux, yardsOf } from './lib/calc';
import { numeroVente, r2, uid } from './lib/format';
import { t } from './i18n';

export interface VarForm { id?: string; coloris: string; sku: string; c1: string; c2: string; seuil: number; stock?: number }
export interface VenteInput { cart: CartLine[]; clientId?: string; remise: Remise; mode: ModePaiement; reference?: string; recu?: number }

const fail = (error: string): Res<any> => ({ ok: false, error });
const good = <T,>(data?: T): Res<T> => ({ ok: true, data });

export interface App {
  db: DB;
  user: User | null;
  login: (identifiant: string, mdp: string) => boolean;
  logout: () => void;
  saveProduit: (p: Produit, vars: VarForm[]) => Res;
  deleteProduit: (id: string) => Res;
  entreeStock: (i: { varianteId: string; quantite: number; unite: UniteVente; fournisseur: string; prixAchatPagne: number; motif: string }) => Res;
  ajusterStock: (i: { varianteId: string; nouveauStock: number; motif: string }) => Res;
  validerVente: (i: VenteInput) => Res<Vente>;
  annulerVente: (id: string, motif: string) => Res;
  saveClient: (c: Client) => Res;
  deleteClient: (id: string) => Res;
  saveParametres: (p: Parametres) => void;
  saveUser: (u: User) => Res;
  resetDemo: () => void;
}

const Ctx = createContext<App | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AppProvider manquant');
  return c;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => repo.load() ?? seedDb());
  const dbRef = useRef(db);
  const [userId, setUserId] = useState<string | null>(() => repo.loadSession());

  useEffect(() => { repo.save(db); }, [db]);
  useEffect(() => { repo.saveSession(userId); }, [userId]);

  const user = useMemo(() => db.users.find(u => u.id === userId && u.actif) ?? null, [db.users, userId]);
  const userRef = useRef(user);
  userRef.current = user;

  /** Applique une transformation synchrone sur la base et renvoie son résultat. */
  const commit = useCallback(<R,>(fn: (d: DB) => { db: DB; res: R }): R => {
    const out = fn(dbRef.current);
    dbRef.current = out.db;
    setDb(out.db);
    return out.res;
  }, []);
  const uidNow = () => userRef.current?.id ?? 'u_admin';


  const api: App = {
    db,
    user,
    login: (identifiant, mdp) => {
      const u = dbRef.current.users.find(x => x.identifiant.toLowerCase() === identifiant.trim().toLowerCase() && x.motDePasse === mdp && x.actif);
      if (u) setUserId(u.id);
      return !!u;
    },
    logout: () => setUserId(null),

    saveProduit: (p, vars) => commit(d => {
      const bad = (m: string) => ({ db: d, res: fail(m) });
      if (!p.nom.trim()) return bad(t('err.nomProduit'));
      if (!p.vendPagne && !p.vendYard) return bad(t('err.uniteVente'));
      if (p.yardsParPagne <= 0) return bad(t('err.yardsParPagne'));
      if ((p.vendPagne && p.prixPagne <= 0) || (p.vendYard && p.prixYard <= 0)) return bad(t('err.prix'));
      if (vars.length === 0 || vars.some(v => !v.coloris.trim())) return bad(t('err.coloris'));
      const keep = new Set(vars.filter(v => v.id).map(v => v.id));
      for (const r of d.variantes.filter(v => v.produitId === p.id && !keep.has(v.id))) {
        if (d.ventes.some(s => s.lignes.some(l => l.varianteId === r.id))) return bad(t('err.colorisVendu', { coloris: r.coloris }));
      }
      const exists = d.produits.some(x => x.id === p.id);
      const produits = exists ? d.produits.map(x => (x.id === p.id ? p : x)) : [...d.produits, p];
      const removedIds = new Set(d.variantes.filter(v => v.produitId === p.id && !keep.has(v.id)).map(v => v.id));
      let variantes = d.variantes.filter(v => !removedIds.has(v.id));
      let mouvements = d.mouvements.filter(m => !removedIds.has(m.varianteId));
      const now = new Date().toISOString();
      for (const f of vars) {
        if (f.id) {
          variantes = variantes.map(v => (v.id === f.id ? { ...v, coloris: f.coloris.trim(), sku: f.sku.trim(), c1: f.c1, c2: f.c2, seuil: f.seuil } : v));
        } else {
          const nv: Variante = { id: uid('v_'), produitId: p.id, coloris: f.coloris.trim(), sku: f.sku.trim(), c1: f.c1, c2: f.c2, stock: r2(Math.max(0, f.stock || 0)), seuil: f.seuil };
          variantes = [...variantes, nv];
          if (nv.stock > 0) {
            mouvements = [...mouvements, { id: uid('m_'), date: now, varianteId: nv.id, type: 'entree', yards: nv.stock, userId: uidNow(), motif: t('stock.stockInitial'), prixAchatPagne: p.prixAchatPagne } as Mouvement];
          }
        }
      }
      return { db: { ...d, produits, variantes, mouvements }, res: good() };
    }),

    deleteProduit: id => commit(d => {
      const ids = new Set(d.variantes.filter(v => v.produitId === id).map(v => v.id));
      if (d.ventes.some(s => s.lignes.some(l => l.produitId === id))) return { db: d, res: fail(t('err.produitVendu')) };
      return {
        db: { ...d, produits: d.produits.filter(p => p.id !== id), variantes: d.variantes.filter(v => !ids.has(v.id)), mouvements: d.mouvements.filter(m => !ids.has(m.varianteId)) },
        res: good(),
      };
    }),

    entreeStock: i => commit(d => {
      const v = d.variantes.find(x => x.id === i.varianteId);
      const p = v && d.produits.find(x => x.id === v.produitId);
      if (!v || !p) return { db: d, res: fail(t('err.introuvable')) };
      if (!(i.quantite > 0)) return { db: d, res: fail(t('err.quantite')) };
      const yards = yardsOf(p, i.unite, i.quantite);
      const mvt: Mouvement = {
        id: uid('m_'), date: new Date().toISOString(), varianteId: v.id, type: 'entree', yards, userId: uidNow(),
        motif: i.motif.trim() || t('stock.reapprovisionnement'), fournisseur: i.fournisseur.trim() || undefined, prixAchatPagne: i.prixAchatPagne > 0 ? i.prixAchatPagne : undefined,
      };
      return {
        db: {
          ...d,
          variantes: d.variantes.map(x => (x.id === v.id ? { ...x, stock: r2(x.stock + yards) } : x)),
          produits: i.prixAchatPagne > 0 ? d.produits.map(x => (x.id === p.id ? { ...x, prixAchatPagne: i.prixAchatPagne } : x)) : d.produits,
          mouvements: [...d.mouvements, mvt],
        },
        res: good(),
      };
    }),

    ajusterStock: i => commit(d => {
      const v = d.variantes.find(x => x.id === i.varianteId);
      if (!v) return { db: d, res: fail(t('err.introuvable')) };
      if (i.nouveauStock < 0) return { db: d, res: fail(t('err.quantite')) };
      if (!i.motif.trim()) return { db: d, res: fail(t('err.motifRequis')) };
      const delta = r2(i.nouveauStock - v.stock);
      if (delta === 0) return { db: d, res: fail(t('err.aucunEcart')) };
      const mvt: Mouvement = { id: uid('m_'), date: new Date().toISOString(), varianteId: v.id, type: 'ajustement', yards: delta, userId: uidNow(), motif: i.motif.trim() };
      return { db: { ...d, variantes: d.variantes.map(x => (x.id === v.id ? { ...x, stock: r2(i.nouveauStock) } : x)), mouvements: [...d.mouvements, mvt] }, res: good() };
    }),

    validerVente: i => commit(d => {
      const bad = (m: string) => ({ db: d, res: fail(m) as Res<Vente> });
      const u = userRef.current;
      if (!u) return bad(t('err.session'));
      if (i.cart.length === 0) return bad(t('err.panierVide'));
      if (i.cart.some(c => !(c.quantite > 0))) return bad(t('err.quantite'));
      const need = new Map<string, number>();
      const lignes = buildLignes(d.produits, d.variantes, i.cart);
      for (const l of lignes) need.set(l.varianteId, r2((need.get(l.varianteId) || 0) + l.yards));
      for (const [vid, y] of need) {
        const v = d.variantes.find(x => x.id === vid)!;
        if (y > v.stock) return bad(t('err.stockInsuffisant', { nom: lignes.find(l => l.varianteId === vid)!.libelle, coloris: v.coloris, stock: String(v.stock) }));
      }
      const tot = totaux(lignes, i.remise);
      if (u.role !== 'admin' && tot.remiseEffPct > d.parametres.remiseMaxVendeur + 0.001) return bad(t('err.remiseMax', { max: String(d.parametres.remiseMaxVendeur) }));
      if ((i.mode === 'flooz' || i.mode === 'tmoney') && !(i.reference || '').trim()) return bad(t('err.reference'));
      if (i.mode === 'especes' && i.recu && i.recu > 0 && i.recu < tot.total) return bad(t('err.recuInsuffisant'));
      const numero = d.prochainNumero;
      const date = new Date().toISOString();
      const vente: Vente = {
        id: uid('s_'), numero, date, vendeurId: u.id, clientId: i.clientId || undefined, lignes, sousTotal: tot.sousTotal, remise: i.remise,
        remiseMontant: tot.remiseMontant, total: tot.total, marge: tot.marge,
        paiement: { mode: i.mode, reference: i.reference?.trim() || undefined, recu: i.mode === 'especes' && i.recu && i.recu > 0 ? i.recu : undefined },
        statut: 'validee',
      };
      const mvts: Mouvement[] = lignes.map(l => ({ id: uid('m_'), date, varianteId: l.varianteId, type: 'vente', yards: -l.yards, userId: u.id, motif: t('stock.motifVente', { n: numeroVente(numero) }), venteId: vente.id }));
      return {
        db: {
          ...d, ventes: [...d.ventes, vente], prochainNumero: numero + 1, mouvements: [...d.mouvements, ...mvts],
          variantes: d.variantes.map(v => (need.has(v.id) ? { ...v, stock: r2(v.stock - need.get(v.id)!) } : v)),
        },
        res: good(vente),
      };
    }),

    annulerVente: (id, motif) => commit(d => {
      const v = d.ventes.find(x => x.id === id);
      if (!v) return { db: d, res: fail(t('err.introuvable')) };
      if (v.statut === 'annulee') return { db: d, res: fail(t('err.dejaAnnulee')) };
      if (!motif.trim()) return { db: d, res: fail(t('err.motifRequis')) };
      const date = new Date().toISOString();
      const back = new Map<string, number>();
      v.lignes.forEach(l => back.set(l.varianteId, r2((back.get(l.varianteId) || 0) + l.yards)));
      const mvts: Mouvement[] = v.lignes.map(l => ({ id: uid('m_'), date, varianteId: l.varianteId, type: 'annulation', yards: l.yards, userId: uidNow(), motif: t('stock.motifAnnulation', { n: numeroVente(v.numero) }), venteId: v.id }));
      return {
        db: {
          ...d,
          ventes: d.ventes.map(x => (x.id === id ? { ...x, statut: 'annulee', annulation: { date, userId: uidNow(), motif: motif.trim() } } : x)),
          variantes: d.variantes.map(x => (back.has(x.id) ? { ...x, stock: r2(x.stock + back.get(x.id)!) } : x)),
          mouvements: [...d.mouvements, ...mvts],
        },
        res: good(),
      };
    }),

    saveClient: c => commit(d => {
      if (!c.nom.trim()) return { db: d, res: fail(t('err.nomClient')) };
      const exists = d.clients.some(x => x.id === c.id);
      return { db: { ...d, clients: exists ? d.clients.map(x => (x.id === c.id ? c : x)) : [...d.clients, c] }, res: good() };
    }),
    deleteClient: id => commit(d => ({ db: { ...d, clients: d.clients.filter(c => c.id !== id), ventes: d.ventes.map(v => (v.clientId === id ? { ...v, clientId: undefined } : v)) }, res: good() })),

    saveParametres: p => commit(d => ({ db: { ...d, parametres: p }, res: 0 })) as unknown as void,

    saveUser: u => commit(d => {
      if (!u.nom.trim() || !u.identifiant.trim() || !u.motDePasse.trim()) return { db: d, res: fail(t('err.champsUtilisateur')) };
      if (d.users.some(x => x.id !== u.id && x.identifiant.toLowerCase() === u.identifiant.trim().toLowerCase())) return { db: d, res: fail(t('err.identifiantPris')) };
      if (u.role !== ('admin' as Role) && d.users.filter(x => x.role === 'admin' && x.actif && x.id !== u.id).length === 0 && d.users.some(x => x.id === u.id && x.role === 'admin')) return { db: d, res: fail(t('err.dernierAdmin')) };
      if (!u.actif && d.users.filter(x => x.role === 'admin' && x.actif && x.id !== u.id).length === 0 && u.role === 'admin') return { db: d, res: fail(t('err.dernierAdmin')) };
      const exists = d.users.some(x => x.id === u.id);
      return { db: { ...d, users: exists ? d.users.map(x => (x.id === u.id ? u : x)) : [...d.users, u] }, res: good() };
    }),

    resetDemo: () => { const n = seedDb(); dbRef.current = n; setDb(n); },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
