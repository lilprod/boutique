/**
 * Caisse hors ligne : ce qui reste sur la tablette quand le réseau tombe.
 *
 * 1. Le **catalogue** de la boutique (produits, coloris et stock, paramètres, promotions en cours),
 *    sans prix d'achat ni marge : de quoi vendre. Ni clients, ni ventes, ni comptes. Effacé à la
 *    déconnexion volontaire.
 * 2. La **file des ventes** encaissées sans réseau, envoyées au serveur dès son retour. Chacune porte
 *    un identifiant (uuid) : un envoi interrompu puis rejoué ne crée jamais de doublon. Elle survit à
 *    une déconnexion : la vente a eu lieu, elle doit arriver au serveur au prochain retour du vendeur.
 *
 * Tout passe par localStorage, entouré de try/catch : stockage plein ou interdit = pas de cache, l'application
 * continue en ligne.
 */
import type { Parametres, Produit, Promotion, Role, Variante, Vente } from '../types';

const CLE_CATALOGUE = 'pagnes.horsLigne.catalogue';
const CLE_FILE = 'pagnes.horsLigne.ventes';

export interface Catalogue {
  user: { id: string; nom: string; role: Role };
  /** Boutique ouverte par le gérant (en-tête X-Boutique), sinon null : boutique de rattachement. */
  boutiqueId: string | null;
  shopMode: boolean;
  produits: Produit[]; variantes: Variante[]; parametres: Parametres; promotions: Promotion[];
  enregistreLe: string;
}

export interface VenteEnAttente {
  uuid: string;
  /** Envoyée avec le jeton de ce vendeur, dans cette boutique : jamais au nom d'un autre compte. */
  userId: string; boutiqueId: string | null;
  /** Corps de POST /api/ventes, avec `uuid` et `hors_ligne` (heure de la vente, montant encaissé). */
  payload: Record<string, unknown>;
  /** Ticket provisoire, pour l'afficher et le réimprimer. */
  vente: Vente;
  /** Refus du serveur (ex. article supprimé entre-temps) : la vente reste en file, à régulariser. */
  erreur?: string;
}

const lire = <T>(cle: string, defaut: T): T => {
  try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : defaut; } catch { return defaut; }
};
const ecrire = (cle: string, v: unknown) => {
  try { localStorage.setItem(cle, JSON.stringify(v)); return true; } catch { return false; }
};

/** Le prix d'achat (donc la marge) ne reste jamais sur la tablette, même pour l'administrateur. */
export function enregistrerCatalogue(c: Omit<Catalogue, 'enregistreLe'>) {
  ecrire(CLE_CATALOGUE, { ...c, produits: c.produits.map(p => ({ ...p, prixAchatPagne: 0 })), enregistreLe: new Date().toISOString() });
}
export const lireCatalogue = (): Catalogue | null => lire<Catalogue | null>(CLE_CATALOGUE, null);
export const effacerCatalogue = () => { try { localStorage.removeItem(CLE_CATALOGUE); } catch { /* rien à effacer */ } };

export const lireFile = (): VenteEnAttente[] => lire<VenteEnAttente[]>(CLE_FILE, []);
const ecrireFile = (f: VenteEnAttente[]) => ecrire(CLE_FILE, f);
/** Faux si le stockage est plein ou interdit : la vente ne peut alors pas être gardée. */
export const ajouterALaFile = (v: VenteEnAttente): boolean => ecrireFile([...lireFile().filter(x => x.uuid !== v.uuid), v]);
export const retirerDeLaFile = (uuid: string) => ecrireFile(lireFile().filter(x => x.uuid !== uuid));
export const marquerErreur = (uuid: string, erreur: string | undefined) => ecrireFile(lireFile().map(x => (x.uuid === uuid ? { ...x, erreur } : x)));

/** Identifiant d'une vente, choisi par la tablette. */
export function nouvelUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

/** Référence imprimée sur un ticket hors ligne, en attendant le numéro attribué par le serveur. */
export const referenceProvisoire = (uuid: string) => 'HL-' + uuid.replace(/-/g, '').slice(0, 8).toUpperCase();
