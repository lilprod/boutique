export type Role = 'admin' | 'vendeur';
export interface User { id: string; nom: string; identifiant: string; motDePasse: string; role: Role; actif: boolean }

export type UniteVente = 'pagne' | 'yard';
export interface Produit {
  id: string; nom: string; type: string; motif: string; origine: string; image?: string;
  yardsParPagne: number; vendPagne: boolean; vendYard: boolean;
  prixPagne: number; prixYard: number; prixAchatPagne: number;
}
/** Une variante = un coloris d'un produit. Le stock est toujours en yards (unité de base, décimale). */
export interface Variante { id: string; produitId: string; coloris: string; sku: string; c1: string; c2: string; stock: number; seuil: number }

export interface Client { id: string; nom: string; telephone: string; adresse: string; creeLe: string }

export type ModePaiement = 'especes' | 'flooz' | 'tmoney' | 'carte';
export interface Remise { type: 'pct' | 'fcfa'; valeur: number }
export interface LigneVente {
  varianteId: string; produitId: string; libelle: string; coloris: string;
  unite: UniteVente; quantite: number; yards: number; prixUnitaire: number;
  brut: number; remise: Remise; total: number; cout: number;
}
export interface Vente {
  id: string; numero: number; date: string; vendeurId: string; clientId?: string;
  lignes: LigneVente[]; sousTotal: number; remise: Remise; remiseMontant: number; total: number; marge: number;
  paiement: { mode: ModePaiement; reference?: string; recu?: number };
  statut: 'validee' | 'annulee';
  annulation?: { date: string; userId: string; motif: string };
}

export type TypeMouvement = 'entree' | 'vente' | 'annulation' | 'ajustement';
export interface Mouvement {
  id: string; date: string; varianteId: string; type: TypeMouvement; yards: number;
  userId: string; motif: string; fournisseur?: string; prixAchatPagne?: number; venteId?: string;
}

export interface Parametres { boutique: string; adresse: string; telephone: string; ticketFormat: '80mm' | 'A4'; remiseMaxVendeur: number; messageTicket: string }

export interface DB {
  produits: Produit[]; variantes: Variante[]; clients: Client[]; ventes: Vente[]; mouvements: Mouvement[];
  users: User[]; parametres: Parametres; prochainNumero: number;
}

export interface CartLine { varianteId: string; unite: UniteVente; quantite: number; remise: Remise }
export interface Res<T = undefined> { ok: boolean; error?: string; data?: T }
