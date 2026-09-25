import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartLine, Client, DB, ModePaiement, Parametres, Produit, Remise, Res, Role, UniteVente, User, Variante, Vente } from './types';
import { ApiError, del, get, post, put, setUnauthorizedHandler, token } from './api';
import { fromClient, fromParametres, fromProduit, fromUser, fromVente, toClient, toParametres, toProduit, toUser, toVariante, toVente } from './lib/mappers';
import { buildLignes, totaux } from './lib/calc';
import { r2 } from './lib/format';
import { t } from './i18n';

export interface VarForm { id?: string; coloris: string; sku: string; c1: string; c2: string; seuil: number; stock?: number }
export type PhotoChange = { file: Blob } | { remove: true };
export interface VenteInput { cart: CartLine[]; clientId?: string; remise: Remise; mode: ModePaiement; reference?: string; recu?: number }

const fail = (error: string): Res<any> => ({ ok: false, error });
const good = <T,>(data?: T): Res<T> => ({ ok: true, data });

/** Exécute un appel API et le convertit en `Res` : les pages affichent `error` tel quel (message français du serveur). */
async function run<T>(fn: () => Promise<T>): Promise<Res<T>> {
  try { return good(await fn()); } catch (e) { return fail(e instanceof ApiError ? e.message : t('err.inattendue')); }
}

export interface App {
  db: DB;
  user: User | null;
  /** false tant que la session et les données initiales se chargent. */
  ready: boolean;
  /** Message à afficher sur l'écran de connexion (session expirée, serveur injoignable…). */
  notice: string | null;
  login: (identifiant: string, mdp: string) => Promise<Res>;
  logout: () => Promise<void>;
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
type Part = 'produits' | 'clients' | 'parametres' | 'users' | 'fournisseurs';
const ALL: Part[] = ['produits', 'clients', 'parametres', 'users', 'fournisseurs'];

interface Data {
  produits: Produit[]; variantes: Variante[]; clients: Client[];
  parametres: Parametres;
  /** Liste complète des comptes : réservée à l'administrateur. */
  comptes: User[] | null;
  fournisseurs: string[];
}
const EMPTY: Data = {
  produits: [], variantes: [], clients: [], comptes: null, fournisseurs: [],
  parametres: { boutique: 'Pagnes de Lomé', adresse: '', telephone: '', ticketFormat: '80mm', remiseMaxVendeur: 15, messageTicket: '' },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const db = useMemo<DB>(() => ({
    produits: data.produits, variantes: data.variantes, clients: data.clients,
    users: data.comptes ?? (user ? [user] : []), // un vendeur n'a pas accès à la liste des comptes
    parametres: data.parametres, fournisseurs: data.fournisseurs,
  }), [data, user]);
  const dbRef = useRef(db);
  dbRef.current = db;

  /** (Re)charge une partie des données depuis l'API. Un vendeur ne charge pas la liste des comptes. */
  const load = useCallback(async (parts: Part[], role?: Role) => {
    const want = new Set(parts);
    const admin = (role ?? userRef.current?.role) === 'admin';
    const [produits, clients, parametres, comptes, fournisseurs] = await Promise.all([
      want.has('produits') ? get<any[]>('/produits') : null,
      want.has('clients') ? get<any[]>('/clients') : null,
      want.has('parametres') ? get('/parametres') : null,
      want.has('users') && admin ? get<any[]>('/users') : null,
      want.has('fournisseurs') && admin ? get<string[]>('/fournisseurs') : null,
    ]);
    setData(prev => ({
      produits: produits ? produits.map(toProduit) : prev.produits,
      variantes: produits ? produits.flatMap(p => (p.variantes ?? []).map(toVariante)) : prev.variantes,
      clients: clients ? clients.map(toClient) : prev.clients,
      parametres: parametres ? toParametres(parametres) : prev.parametres,
      comptes: comptes ? comptes.map(toUser) : prev.comptes,
      fournisseurs: fournisseurs ?? prev.fournisseurs,
    }));
  }, []);

  const clear = useCallback(() => { token.set(null); setUser(null); setData(EMPTY); }, []);

  /** Ouvre la session : charge tout, ou renvoie à la connexion si le chargement échoue. */
  const start = useCallback(async (u: User): Promise<Res> => {
    try {
      setUser(u);
      await load(ALL, u.role);
      setNotice(null);
      return good();
    } catch (e) {
      clear();
      return fail(e instanceof ApiError ? e.message : t('err.inattendue'));
    }
  }, [load, clear]);

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
    db, user, ready, notice,

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

    saveProduit: async (p, vars, photo) => {
      if (!p.nom.trim()) return fail(t('err.nomProduit'));
      if (!p.vendPagne && !p.vendYard) return fail(t('err.uniteVente'));
      if (p.yardsParPagne <= 0) return fail(t('err.yardsParPagne'));
      if ((p.vendPagne && p.prixPagne <= 0) || (p.vendYard && p.prixYard <= 0)) return fail(t('err.prix'));
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
      const need = new Map<string, number>();
      const lignes = buildLignes(d.produits, d.variantes, i.cart);
      for (const l of lignes) need.set(l.varianteId, r2((need.get(l.varianteId) || 0) + l.yards));
      for (const [vid, y] of need) {
        const v = d.variantes.find(x => x.id === vid)!;
        if (y > v.stock) return fail(t('err.stockInsuffisant', { nom: lignes.find(l => l.varianteId === vid)!.libelle, coloris: v.coloris, stock: String(v.stock) }));
      }
      const tot = totaux(lignes, i.remise);
      if (userRef.current.role !== 'admin' && tot.remiseEffPct > d.parametres.remiseMaxVendeur + 0.001) return fail(t('err.remiseMax', { max: String(d.parametres.remiseMaxVendeur) }));
      if ((i.mode === 'flooz' || i.mode === 'tmoney') && !(i.reference || '').trim()) return fail(t('err.reference'));
      if (i.mode === 'especes' && i.recu && i.recu > 0 && i.recu < tot.total) return fail(t('err.recuInsuffisant'));
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

    saveParametres: async p => run(async () => { await put('/parametres', fromParametres(p)); await load(['parametres']); }),

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
