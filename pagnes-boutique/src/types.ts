export type Role = 'admin' | 'vendeur' | 'tenant_admin' | 'boutique_admin' | 'super_admin';
export interface User { id: string; nom: string; identifiant: string; motDePasse: string; role: Role; actif: boolean }

export type UniteVente = 'pagne' | 'yard' | 'metre';
export interface Produit {
  id: string; nom: string; type: string; motif: string; origine: string; image?: string;
  yardsParPagne: number; vendPagne: boolean; vendYard: boolean; vendMetre: boolean;
  prixPagne: number; prixYard: number; prixMetre: number; prixAchatPagne: number;
  /** Option « plusieurs propriétaires » : à qui appartient ce pagne. Absent = non attribué. */
  proprietaireId?: string;
}
/**
 * Promotion de la boutique, appliquée automatiquement à la caisse (une par ligne, la plus avantageuse).
 * `fcfa` : montant retiré par unité vendue, l'unité est alors obligatoire. `quantiteMin` : seuil sur tout le panier.
 */
export interface Promotion {
  id: string; nom: string; typeRemise: 'pct' | 'fcfa'; valeur: number;
  cible: 'tout' | 'type' | 'motif' | 'produit' | 'variante'; cibleTexte?: string; produitId?: string; varianteId?: string;
  unite?: UniteVente; quantiteMin: number; debut?: string; fin?: string; actif: boolean;
}
/** Personne à qui appartient une partie du stock ; `motifs` : les motifs qui lui reviennent automatiquement. */
export interface Proprietaire { id: string; nom: string; userId?: string; actif: boolean; motifs: string[]; nbProduits: number }
/** Une variante = un coloris d'un produit. Le stock est exprimé dans l'unité de stock de la boutique (Parametres.uniteStock). */
export interface Variante { id: string; produitId: string; coloris: string; sku: string; c1: string; c2: string; stock: number; seuil: number }

/** `achats`, `depense` et `derniereVente` sont calculés par l'API (ventes validées seulement). */
/** `points` : solde de fidélité (peut être négatif après l'annulation d'une vente dont les points étaient déjà dépensés). */
export interface Client { id: string; nom: string; telephone: string; adresse: string; creeLe: string; achats?: number; depense?: number; derniereVente?: string; points: number }
export type TypeMouvementPoints = 'gain' | 'utilisation' | 'annulation' | 'ajustement' | 'expiration';
export interface MouvementPoints { id: string; date: string; type: TypeMouvementPoints; points: number; motif?: string; userNom?: string; venteNumero?: number }

export type ModePaiement = 'especes' | 'flooz' | 'tmoney' | 'carte';
export interface Remise { type: 'pct' | 'fcfa'; valeur: number }
export interface LigneVente {
  varianteId: string; produitId: string; libelle: string; coloris: string;
  /** `yards` sert au calcul du coût ; `quantiteStock` est ce qui sort du stock, dans l'unité de stock de la boutique. */
  unite: UniteVente; quantite: number; yards: number; quantiteStock: number; prixUnitaire: number;
  brut: number; remise: Remise; total: number; cout: number;
  /** Promotion appliquée à la ligne (nom gelé à la vente) et montant retiré, avant la remise manuelle. */
  promotionId?: string; promotionLibelle?: string; remisePromo: number;
}
export interface Vente {
  id: string; numero: number; date: string; vendeurId: string; vendeurNom?: string; clientId?: string; clientNom?: string;
  lignes: LigneVente[]; sousTotal: number; remise: Remise; remiseMontant: number; total: number; marge: number;
  /** Fidélité : points échangés (et leur valeur en FCFA) et points gagnés sur ce ticket. */
  pointsUtilises: number; remisePoints: number; pointsGagnes: number;
  paiement: { mode: ModePaiement; reference?: string; recu?: number };
  statut: 'validee' | 'annulee';
  annulation?: { date: string; userId: string; motif: string };
}

export type TypeMouvement = 'entree' | 'vente' | 'annulation' | 'ajustement';
export interface Mouvement {
  id: string; date: string; varianteId: string; type: TypeMouvement; quantite: number;
  userId: string; userNom?: string; motif: string; fournisseur?: string; prixAchatPagne?: number; venteId?: string;
}

export interface Parametres {
  boutique: string; adresse: string; telephone: string; ticketFormat: '80mm' | 'A4'; remiseMaxVendeur: number; messageTicket: string;
  /** Politique de vente propre à la boutique. */
  autorisePagne: boolean; autoriseYard: boolean; autoriseMetre: boolean;
  /** Ne s'applique que si la boutique vend uniquement au pagne (grossiste). */
  quantiteMinPanier: number;
  uniteStock: UniteVente;
  /** Boutique tenue par plusieurs personnes : stock et ventes suivis par propriétaire. */
  multiProprietaires: boolean;
  /** Fidélité : 1 point par `fideliteTranche` FCFA payés ; 1 point = `fideliteValeurPoint` FCFA ; utilisable dès `fideliteSeuil` points ;
   *  solde perdu après `fideliteExpirationMois` mois sans achat (0 = jamais). */
  fideliteActive: boolean; fideliteTranche: number; fideliteValeurPoint: number; fideliteSeuil: number; fideliteExpirationMois: number;
}

/** Données chargées à la connexion. L'historique (ventes, mouvements) et les statistiques sont lus à la demande, par page. */
export interface DB {
  produits: Produit[]; variantes: Variante[]; clients: Client[];
  /** Comptes (administrateur) ; pour un vendeur, uniquement lui-même. */
  users: User[]; parametres: Parametres; proprietaires: Proprietaire[];
  /** Administrateur : toutes les promotions ; vendeur : celles en cours. */
  promotions: Promotion[];
  /** Fournisseurs déjà saisis (suggestions du formulaire d'entrée de stock ; administrateur). */
  fournisseurs: string[];
}

export interface CartLine { varianteId: string; unite: UniteVente; quantite: number; remise: Remise }
export interface Res<T = void> { ok: boolean; error?: string; data?: T }
