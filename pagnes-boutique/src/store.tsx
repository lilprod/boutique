import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, Client, DB, ModePaiement, Parametres, Produit, Promotion, Proprietaire, Remise, Res, Role, UniteVente, User, Variante, Vente } from './types';
import { ApiError, del, get, post, put, setUnauthorizedHandler, token } from './api';
import { fromClient, fromParametres, fromProduit, fromPromotion, fromProprietaire, fromUser, fromVente, toClient, toParametres, toProduit, toPromotion, toProprietaire, toUser, toVariante, toVente } from './lib/mappers';
import { buildLignes, minimumNonAtteint, prixUnitaire, refusPoints, remisePoints, totaux, UNITES, vendAu } from './lib/calc';
import { num, r2 } from './lib/format';
import { t, uniteLabel } from './i18n';

export interface VarForm { id?: string; coloris: string; sku: string; c1: string; c2: string; seuil: number; stock?: number }
export type PhotoChange = { file: Blob } | { remove: true };
export interface VenteInput { cart: CartLine[]; clientId?: string; remise: Remise; mode: ModePaiement; reference?: string; recu?: number; pointsUtilises?: number }

const fail = (error: string): Res<any> => ({ ok: false, error });
const good = <T,>(data?: T): Res<T> => ({ ok: true, data });

/** Exécute un appel API et le convertit en `Res` : les pages affichent `error` tel quel (message français du serveur). */
async function run<T>(fn: () => Promise<T>): Promise<Res<T>> {
  try { return good(await fn()); } catch (e) { return fail(e instanceof ApiError ? e.message : t('err.inattendue')); }
}

export interface App {
  db: DB;
  user: User | null;
  shopMode: boolean;
  /** false tant que la session et les données initiales se chargent. */
  ready: boolean;
  /** Message à afficher sur l'écran de connexion (session expirée, serveur injoignable…). */
  notice: string | null;
  login: (identifiant: string, mdp: string) => Promise<Res>;
  logout: () => Promise<void>;
  openBoutique: () => Promise<Res>;
  returnToTenantPortal: () => void;
  /** `photo` : nouvelle photo à envoyer (`{ file }`) ou retrait de l'actuelle (`{ remove }`) ; absent = inchangée. `data.photoErreur` : produit enregistré mais photo refusée. */
  saveProduit: (p: Produit, vars: VarForm[], photo?: PhotoChange) => Promise<Res<{ photoErreur?: string }>>;
  deleteProduit: (id: string) => Promise<Res>;
  entreeStock: (i: { varianteId: string; quantite: number; unite: UniteVente; fournisseur: string; prixAchatPagne: number; motif: string }) => Promise<Res>;
  ajusterStock: (i: { varianteId: string; nouveauStock: number; motif: string }) => Promise<Res>;
  validerVente: (i: VenteInput) => Promise<Res<Vente>>;
  annulerVente: (id: string, motif: string) => Promise<Res>;
  saveClient: (c: Client) => Promise<Res<Client>>;
  deleteClient: (id: string) => Promise<Res>;
  saveParametres: (p: Parametres) => Promise<Res>;
  /** Enregistre un propriétaire et ses motifs ; les produits de ces motifs lui sont attribués côté serveur. */
  saveProprietaire: (p: Proprietaire) => Promise<Res>;
  deleteProprietaire: (id: string) => Promise<Res>;
  /** Ajout (positif) ou retrait (négatif) manuel de points de fidélité, avec motif ; administrateur. */
  ajusterPoints: (clientId: string, points: number, motif: string) => Promise<Res>;
  savePromotion: (p: Promotion) => Promise<Res>;
  deletePromotion: (id: string) => Promise<Res>;
  saveUser: (u: User) => Promise<Res>;
}

const Ctx = createContext<App | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AppProvider manquant');
  return c;
};

/**
 * Données chargées à la connexion : elles ne grossissent pas avec l'historique de la boutique.
 * Les ventes, mouvements et statistiques sont lus à la demande par les pages (voir lib/usePaged.ts).
 */
type Part = 'produits' | 'clients' | 'parametres' | 'users' | 'fournisseurs' | 'proprietaires' | 'promotions';
const ALL: Part[] = ['produits', 'clients', 'parametres', 'users', 'fournisseurs', 'proprietaires', 'promotions'];

interface Data {
  produits: Produit[]; variantes: Variante[]; clients: Client[];
  parametres: Parametres;
  proprietaires: Proprietaire[];
  promotions: Promotion[];
  /** Liste complète des comptes : réservée à l'administrateur. */
  comptes: User[] | null;
  fournisseurs: string[];
}
const EMPTY: Data = {
  produits: [], variantes: [], clients: [], comptes: null, fournisseurs: [], proprietaires: [], promotions: [],
  parametres: {
    boutique: 'Pagnes de Lomé', adresse: '', telephone: '', ticketFormat: '80mm', remiseMaxVendeur: 15, messageTicket: '',
    autorisePagne: true, autoriseYard: false, autoriseMetre: false, quantiteMinPanier: 1, uniteStock: 'yard', multiProprietaires: false,
    fideliteActive: false, fideliteTranche: 1000, fideliteValeurPoint: 10, fideliteSeuil: 100, fideliteExpirationMois: 12,
  },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [user, setUser] = useState<User | null>(null);
  const [shopMode, setShopMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const shopModeRef = useRef(shopMode);
  shopModeRef.current = shopMode;

  const db = useMemo<DB>(() => ({
    produits: data.produits, variantes: data.variantes, clients: data.clients,
    users: data.comptes ?? (user ? [user] : []), // un vendeur n'a pas accès à la liste des comptes
    parametres: data.parametres, fournisseurs: data.fournisseurs, proprietaires: data.proprietaires, promotions: data.promotions,
  }), [data, user]);
  const dbRef = useRef(db);
  dbRef.current = db;

  /** (Re)charge une partie des données depuis l'API. Un vendeur ne charge pas la liste des comptes. */
  const load = useCallback(async (parts: Part[], role?: Role) => {
    const currentRole = role ?? userRef.current?.role;
    if (currentRole === 'super_admin' || (currentRole === 'tenant_admin' && !shopModeRef.current)) {
      return;
    }

    const want = new Set(parts);
    const admin = currentRole === 'admin' || currentRole === 'boutique_admin' || (currentRole === 'tenant_admin' && shopModeRef.current);
    const [produits, clients, parametres, comptes, fournisseurs, proprietaires, promotions] = await Promise.all([
      want.has('produits') ? get<any[]>('/produits') : null,
      want.has('clients') ? get<any[]>('/clients') : null,
      want.has('parametres') ? get('/parametres') : null,
      want.has('users') && admin ? get<any[]>('/users') : null,
      want.has('fournisseurs') && admin ? get<string[]>('/fournisseurs') : null,
      want.has('proprietaires') ? get<any[]>('/proprietaires') : null,
      want.has('promotions') ? get<any[]>('/promotions') : null,
    ]);
    setData(prev => ({
      produits: produits ? produits.map(toProduit) : prev.produits,
      variantes: produits ? produits.flatMap(p => (p.variantes ?? []).map(toVariante)) : prev.variantes,
      clients: clients ? clients.map(toClient) : prev.clients,
      parametres: parametres ? toParametres(parametres) : prev.parametres,
      comptes: comptes ? comptes.map(toUser) : prev.comptes,
      fournisseurs: fournisseurs ?? prev.fournisseurs,
      proprietaires: proprietaires ? proprietaires.map(toProprietaire) : prev.proprietaires,
      promotions: promotions ? promotions.map(toPromotion) : prev.promotions,
    }));
  }, []);

  const clear = useCallback(() => { token.set(null); setUser(null); setData(EMPTY); setShopMode(false); }, []);

  /** Ouvre la session : charge tout, ou renvoie à la connexion si le chargement échoue. */
  const start = useCallback(async (u: User): Promise<Res> => {
    try {
      setShopMode(false);
      setUser(u);
      await load(ALL, u.role);
      setNotice(null);
      return good();
    } catch (e) {
      clear();
      return fail(e instanceof ApiError ? e.message : t('err.inattendue'));
    }
  }, [load, clear]);

  const openBoutique = async (): Promise<Res> => {
    if (userRef.current?.role !== 'tenant_admin') return fail('Action réservée à un administrateur tenant.');

    shopModeRef.current = true;
    setShopMode(true);
    try {
      await load(ALL, 'tenant_admin');
      return good();
    } catch (e) {
      shopModeRef.current = false;
      setShopMode(false);
      setData(EMPTY);
      return fail(e instanceof ApiError ? e.message : t('err.inattendue'));
    }
  };

  const returnToTenantPortal = () => {
    shopModeRef.current = false;
    setShopMode(false);
    setData(EMPTY);
  };

  // Jeton expiré ou compte désactivé : retour à la connexion, sans laisser de données affichées.
  useEffect(() => { setUnauthorizedHandler(() => { clear(); setNotice(t('err.session')); }); }, [clear]);

  // Au démarrage : reprend la session si un jeton est présent.
  useEffect(() => {
    (async () => {
      if (token.get()) {
        try {
          const me = await get<{ id: number; nom: string; role: Role }>('/me');
          const r = await start({ id: String(me.id), nom: me.nom, identifiant: '', motDePasse: '', role: me.role, actif: true });
          if (!r.ok) setNotice(r.error!);
        } catch (e) {
          // Serveur injoignable : on garde le jeton pour la prochaine tentative ; sinon (401…) `request` l'a déjà effacé.
          if (e instanceof ApiError && e.status === 0) setNotice(e.message); else token.set(null);
        }
      }
      setReady(true);
    })();
  }, [start]);

  const api: App = {
    db, user, shopMode, ready, notice,

    login: async (identifiant, mdp) => {
      try {
        const r = await post<{ user: { id: number; nom: string; role: Role }; token: string }>('/login', { identifiant: identifiant.trim(), mot_de_passe: mdp });
        token.set(r.token);
        return await start({ id: String(r.user.id), nom: r.user.nom, identifiant: identifiant.trim(), motDePasse: '', role: r.user.role, actif: true });
      } catch (e) {
        return fail(e instanceof ApiError ? e.message : t('err.inattendue'));
      }
    },

    logout: async () => {
      try { await post('/logout'); } catch { /* jeton déjà invalide ou serveur injoignable : on déconnecte quand même */ }
      clear(); setNotice(null);
    },

    openBoutique,
    returnToTenantPortal,

    saveProduit: async (saisi, vars, photo) => {
      // Une unité que la boutique n'autorise plus est retirée du produit à l'enregistrement.
      const params = dbRef.current.parametres;
      const p = { ...saisi, vendPagne: saisi.vendPagne && params.autorisePagne, vendYard: saisi.vendYard && params.autoriseYard, vendMetre: saisi.vendMetre && params.autoriseMetre };
      if (!p.nom.trim()) return fail(t('err.nomProduit'));
      if (!p.vendPagne && !p.vendYard && !p.vendMetre) return fail(t('err.uniteVente'));
      if (p.yardsParPagne <= 0) return fail(t('err.yardsParPagne'));
      if (UNITES.some(u => vendAu(p, u) && prixUnitaire(p, u) <= 0)) return fail(t('err.prix'));
      if (vars.length === 0 || vars.some(v => !v.coloris.trim())) return fail(t('err.coloris'));
      const exists = dbRef.current.produits.some(x => x.id === p.id);
      const payload = fromProduit({ ...p, nom: p.nom.trim() }, vars);
      return run(async () => {
        const saved = await (exists ? put(`/produits/${p.id}`, payload) : post('/produits', payload));
        // La photo a son propre appel, une fois le produit enregistré (il a alors son identifiant serveur).
        // Si elle échoue, le produit reste enregistré : on le signale sans le recréer à la validation suivante.
        let photoErreur: string | undefined;
        if (photo) {
          try {
            if ('remove' in photo) await del(`/produits/${saved.id}/image`);
            else { const form = new FormData(); form.append('image', photo.file, 'photo.jpg'); await post(`/produits/${saved.id}/image`, form); }
          } catch (e) {
            photoErreur = e instanceof ApiError ? e.message : t('err.inattendue');
          }
        }
        await load(['produits', 'fournisseurs']);
        return { photoErreur };
      });
    },

    deleteProduit: id => run(async () => { await del(`/produits/${id}`); await load(['produits', 'fournisseurs']); }),

    entreeStock: async i => {
      if (!(i.quantite > 0)) return fail(t('err.quantite'));
      return run(async () => {
        await post(`/variantes/${i.varianteId}/entree`, {
          unite: i.unite, quantite: i.quantite, fournisseur: i.fournisseur.trim() || null,
          prix_achat_pagne: i.prixAchatPagne > 0 ? Math.round(i.prixAchatPagne) : null, motif: i.motif.trim() || null,
        });
        await load(['produits', 'fournisseurs']);
      });
    },

    ajusterStock: async i => {
      const v = dbRef.current.variantes.find(x => x.id === i.varianteId);
      if (!v) return fail(t('err.introuvable'));
      if (i.nouveauStock < 0) return fail(t('err.quantite'));
      if (!i.motif.trim()) return fail(t('err.motifRequis'));
      if (r2(i.nouveauStock - v.stock) === 0) return fail(t('err.aucunEcart'));
      return run(async () => {
        await post(`/variantes/${i.varianteId}/ajuster`, { nouveau_stock: i.nouveauStock, motif: i.motif.trim() });
        await load(['produits', 'fournisseurs']);
      });
    },

    validerVente: async i => {
      const d = dbRef.current;
      if (!userRef.current) return fail(t('err.session'));
      if (i.cart.length === 0) return fail(t('err.panierVide'));
      if (i.cart.some(c => !(c.quantite > 0))) return fail(t('err.quantite'));
      if (minimumNonAtteint(d.parametres, i.cart)) return fail(t('err.quantiteMinPanier', { n: num(d.parametres.quantiteMinPanier) }));
      const need = new Map<string, number>();
      const lignes = buildLignes(d.produits, d.variantes, i.cart, d.parametres.uniteStock, d.promotions);
      for (const l of lignes) need.set(l.varianteId, r2((need.get(l.varianteId) || 0) + l.quantiteStock));
      for (const [vid, q] of need) {
        const v = d.variantes.find(x => x.id === vid)!;
        if (q > v.stock) return fail(t('err.stockInsuffisant', { nom: lignes.find(l => l.varianteId === vid)!.libelle, coloris: v.coloris, stock: num(v.stock), unite: uniteLabel(d.parametres.uniteStock, v.stock) }));
      }
      const tot = totaux(lignes, i.remise);
      if (!['admin', 'boutique_admin'].includes(userRef.current.role) && !shopModeRef.current && tot.remiseEffPct > d.parametres.remiseMaxVendeur + 0.001) return fail(t('err.remiseMax', { max: String(d.parametres.remiseMaxVendeur) }));
      const points = i.clientId ? i.pointsUtilises ?? 0 : 0;
      const refus = refusPoints(d.parametres, d.clients.find(c => c.id === i.clientId), points, tot.total);
      if (refus) return fail(t(refus.cle, refus.vars));
      const aPayer = tot.total - remisePoints(d.parametres, points);
      if ((i.mode === 'flooz' || i.mode === 'tmoney') && !(i.reference || '').trim()) return fail(t('err.reference'));
      if (i.mode === 'especes' && i.recu && i.recu > 0 && i.recu < aPayer) return fail(t('err.recuInsuffisant'));
      return run(async () => {
        // La vente est validée par le serveur (stock, remise, numéro) : c'est lui qui fait foi, pas ce calcul.
        const vente = toVente(await post('/ventes', fromVente(i)));
        await load(['produits', 'clients']);
        return vente;
      });
    },

    annulerVente: async (id, motif) => {
      if (!motif.trim()) return fail(t('err.motifRequis'));
      return run(async () => { await post(`/ventes/${id}/annuler`, { motif: motif.trim() }); await load(['produits', 'clients']); });
    },

    saveClient: async c => {
      if (!c.nom.trim()) return fail(t('err.nomClient'));
      const exists = dbRef.current.clients.some(x => x.id === c.id);
      return run(async () => {
        const saved = toClient(await (exists ? put(`/clients/${c.id}`, fromClient(c)) : post('/clients', fromClient(c))));
        await load(['clients']);
        return saved; // porte l'identifiant attribué par le serveur (la caisse s'en sert pour sélectionner le nouveau client)
      });
    },

    deleteClient: id => run(async () => { await del(`/clients/${id}`); await load(['clients']); }),

    // L'unité de stock peut convertir les quantités, et l'option propriétaires changer l'affichage : tout est relu.
    saveParametres: async p => run(async () => { await put('/parametres', fromParametres(p)); await load(['parametres', 'produits', 'proprietaires']); }),

    saveProprietaire: async p => {
      if (!p.nom.trim()) return fail(t('err.nomProprietaire'));
      const exists = dbRef.current.proprietaires.some(x => x.id === p.id);
      return run(async () => {
        await (exists ? put(`/proprietaires/${p.id}`, fromProprietaire(p)) : post('/proprietaires', fromProprietaire(p)));
        await load(['proprietaires', 'produits']); // des produits ont pu changer de propriétaire
      });
    },

    deleteProprietaire: id => run(async () => { await del(`/proprietaires/${id}`); await load(['proprietaires', 'produits']); }),

    ajusterPoints: async (clientId, points, motif) => {
      if (!Math.round(points) || !motif.trim()) return fail(t('err.pointsAjust'));
      return run(async () => {
        await post(`/clients/${clientId}/points`, { points: Math.round(points), motif: motif.trim() });
        await load(['clients']);
      });
    },

    savePromotion: async p => {
      if (!p.nom.trim()) return fail(t('err.nomPromotion'));
      const exists = dbRef.current.promotions.some(x => x.id === p.id);
      return run(async () => {
        await (exists ? put(`/promotions/${p.id}`, fromPromotion(p)) : post('/promotions', fromPromotion(p)));
        await load(['promotions']);
      });
    },

    deletePromotion: id => run(async () => { await del(`/promotions/${id}`); await load(['promotions']); }),

    saveUser: async u => {
      const exists = dbRef.current.users.some(x => x.id === u.id);
      if (!u.nom.trim() || !u.identifiant.trim() || (!exists && !u.motDePasse.trim())) return fail(t('err.champsUtilisateur'));
      if (u.motDePasse.trim() && u.motDePasse.trim().length < 6) return fail(t('err.mdpCourt'));
      return run(async () => {
        await (exists ? put(`/users/${u.id}`, fromUser(u)) : post('/users', fromUser(u)));
        await load(['users']);
      });
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
