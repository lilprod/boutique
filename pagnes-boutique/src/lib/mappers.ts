/** Conversions entre le JSON de l'API Laravel (snake_case, ids numériques) et les types du frontend (camelCase, ids texte). */
import type { Client, LigneVente, ModePaiement, Mouvement, MouvementPoints, Parametres, Produit, Promotion, Proprietaire, Role, User, Variante, Vente } from '../types';
import type { VarForm, VenteInput } from '../store';

const s = (id: unknown) => String(id);
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const toProduit = (p: any): Produit => ({
  id: s(p.id), nom: p.nom, type: p.type, motif: p.motif ?? '', origine: p.origine ?? '', image: p.image_url ?? undefined, // adresse du fichier
  yardsParPagne: n(p.yards_par_pagne), vendPagne: !!p.vend_pagne, vendYard: !!p.vend_yard, vendMetre: !!p.vend_metre,
  prixPagne: n(p.prix_pagne), prixYard: n(p.prix_yard), prixMetre: n(p.prix_metre),
  // Le prix d'achat n'est envoyé qu'à l'administrateur.
  prixAchatPagne: n(p.prix_achat_pagne),
  proprietaireId: p.proprietaire_id == null ? undefined : s(p.proprietaire_id),
});

export const toProprietaire = (p: any): Proprietaire => ({
  id: s(p.id), nom: p.nom, userId: p.user_id == null ? undefined : s(p.user_id), actif: !!p.actif,
  motifs: (p.motifs ?? []).map((m: any) => m.motif), nbProduits: n(p.produits_count),
});

export const toMouvementPoints = (m: any): MouvementPoints => ({
  id: s(m.id), date: m.created_at, type: m.type, points: n(m.points), motif: m.motif ?? undefined,
  userNom: m.utilisateur?.nom, venteNumero: m.vente?.numero ?? undefined,
});

export const toPromotion = (p: any): Promotion => ({
  id: s(p.id), nom: p.nom, typeRemise: p.type_remise, valeur: n(p.valeur), cible: p.cible, cibleTexte: p.cible_texte ?? undefined,
  produitId: p.produit_id == null ? undefined : s(p.produit_id), varianteId: p.variante_id == null ? undefined : s(p.variante_id),
  unite: p.unite ?? undefined, quantiteMin: n(p.quantite_min), debut: p.debut ?? undefined, fin: p.fin ?? undefined, actif: !!p.actif,
});

export const fromPromotion = (p: Promotion) => ({
  nom: p.nom.trim(), type_remise: p.typeRemise, valeur: p.valeur, cible: p.cible,
  cible_texte: p.cible === 'type' || p.cible === 'motif' ? (p.cibleTexte ?? '').trim() : null,
  produit_id: p.cible === 'produit' && p.produitId ? Number(p.produitId) : null,
  variante_id: p.cible === 'variante' && p.varianteId ? Number(p.varianteId) : null,
  unite: p.unite ?? null, quantite_min: p.quantiteMin || 0, debut: p.debut || null, fin: p.fin || null, actif: p.actif,
});

export const fromProprietaire = (p: Proprietaire) => ({
  nom: p.nom.trim(), user_id: p.userId ? Number(p.userId) : null, actif: p.actif, motifs: p.motifs.map(m => m.trim()).filter(Boolean),
});

export const toVariante = (v: any): Variante => ({
  id: s(v.id), produitId: s(v.produit_id), coloris: v.coloris, sku: v.sku, c1: v.c1, c2: v.c2, stock: n(v.stock), seuil: n(v.seuil),
});

export const toClient = (c: any): Client => ({
  id: s(c.id), nom: c.nom, telephone: c.telephone ?? '', adresse: c.adresse ?? '', creeLe: c.created_at,
  achats: n(c.achats), depense: n(c.depense), derniereVente: c.derniere_vente ?? undefined, points: n(c.points),
});

const toLigne = (l: any): LigneVente => ({
  varianteId: s(l.variante_id), produitId: s(l.produit_id), libelle: l.libelle, coloris: l.coloris, unite: l.unite,
  quantite: n(l.quantite), yards: n(l.yards), quantiteStock: n(l.quantite_stock), prixUnitaire: n(l.prix_unitaire), brut: n(l.brut),
  remise: { type: l.remise_type, valeur: n(l.remise_valeur) }, total: n(l.total),
  promotionId: l.promotion_id == null ? undefined : s(l.promotion_id), promotionLibelle: l.promotion_libelle ?? undefined, remisePromo: n(l.remise_promo),
  cout: n(l.cout), // absent pour un vendeur (jamais affiché)
});

export const toVente = (v: any): Vente => ({
  id: s(v.id), numero: n(v.numero), date: v.created_at, vendeurId: s(v.vendeur_id), vendeurNom: v.vendeur?.nom,
  clientId: v.client_id == null ? undefined : s(v.client_id), clientNom: v.client?.nom,
  lignes: (v.lignes ?? []).map(toLigne), sousTotal: n(v.sous_total), remise: { type: v.remise_type, valeur: n(v.remise_valeur) },
  remiseMontant: n(v.remise_montant), total: n(v.total), marge: n(v.marge),
  pointsUtilises: n(v.points_utilises), remisePoints: n(v.remise_points), pointsGagnes: n(v.points_gagnes),
  paiement: { mode: v.paiement_mode as ModePaiement, reference: v.paiement_reference ?? undefined, recu: v.paiement_recu ?? undefined },
  statut: v.statut,
  annulation: v.statut === 'annulee' ? { date: v.annulation_date, userId: s(v.annulation_user_id), motif: v.annulation_motif ?? '' } : undefined,
});

export const toMouvement = (m: any): Mouvement => ({
  id: s(m.id), date: m.created_at, varianteId: s(m.variante_id), type: m.type, quantite: n(m.quantite), userId: s(m.user_id), userNom: m.utilisateur?.nom, motif: m.motif,
  fournisseur: m.fournisseur ?? undefined, prixAchatPagne: m.prix_achat_pagne ?? undefined, venteId: m.vente_id == null ? undefined : s(m.vente_id),
});

export const toParametres = (p: any): Parametres => ({
  boutique: p.boutique, adresse: p.adresse ?? '', telephone: p.telephone ?? '', ticketFormat: p.ticket_format,
  remiseMaxVendeur: n(p.remise_max_vendeur), messageTicket: p.message_ticket ?? '',
  autorisePagne: !!p.autorise_pagne, autoriseYard: !!p.autorise_yard, autoriseMetre: !!p.autorise_metre,
  quantiteMinPanier: n(p.quantite_min_panier) || 1, uniteStock: p.unite_stock ?? 'yard',
  multiProprietaires: !!p.multi_proprietaires,
  fideliteActive: !!p.fidelite_active, fideliteTranche: n(p.fidelite_tranche) || 1000, fideliteValeurPoint: n(p.fidelite_valeur_point) || 10,
  fideliteSeuil: n(p.fidelite_seuil), fideliteExpirationMois: n(p.fidelite_expiration_mois),
});

/** Utilisateur de la liste admin (/users) : le mot de passe n'est jamais renvoyé. */
export const toUser = (u: any): User => ({
  id: s(u.id), nom: u.nom, identifiant: u.email, motDePasse: '', role: u.role as Role, actif: !!u.actif,
});

/** Un vendeur n'a pas accès à /users : on ne connaît de ses collègues que id et nom (via ventes et mouvements). */
export const toUserPartiel = (u: { id: unknown; nom: string }): User => ({
  id: s(u.id), nom: u.nom, identifiant: '', motDePasse: '', role: 'vendeur', actif: true,
});

/* ---------- Frontend → API ---------- */

export const fromProduit = (p: Produit, vars: VarForm[]) => ({
  nom: p.nom, type: p.type, motif: p.motif || null, origine: p.origine || null,
  // La photo n'est pas envoyée avec le produit : elle a son propre appel (POST/DELETE /produits/{id}/image).
  yards_par_pagne: p.yardsParPagne, vend_pagne: p.vendPagne, vend_yard: p.vendYard, vend_metre: p.vendMetre,
  prix_pagne: Math.round(p.prixPagne), prix_yard: Math.round(p.prixYard), prix_metre: Math.round(p.prixMetre), prix_achat_pagne: Math.round(p.prixAchatPagne),
  // Vide : le serveur applique la règle du motif, s'il y en a une.
  proprietaire_id: p.proprietaireId ? Number(p.proprietaireId) : null,
  variantes: vars.map(v => ({
    ...(v.id ? { id: Number(v.id) } : {}),
    coloris: v.coloris.trim(), sku: v.sku.trim() || null, c1: v.c1, c2: v.c2, seuil: v.seuil, ...(v.id ? {} : { stock: v.stock ?? 0 }),
  })),
});

export const fromVente = (i: VenteInput) => ({
  client_id: i.clientId ? Number(i.clientId) : null,
  remise_type: i.remise.type, remise_valeur: i.remise.valeur,
  paiement: {
    mode: i.mode,
    reference: (i.mode === 'flooz' || i.mode === 'tmoney') ? (i.reference ?? '').trim() : null,
    recu: i.mode === 'especes' && i.recu && i.recu > 0 ? Math.round(i.recu) : null,
  },
  lignes: i.cart.map(c => ({ variante_id: Number(c.varianteId), unite: c.unite, quantite: c.quantite, remise_type: c.remise.type, remise_valeur: c.remise.valeur })),
  points_utilises: i.clientId && i.pointsUtilises ? Math.round(i.pointsUtilises) : 0,
});

export const fromClient = (c: Client) => ({ nom: c.nom.trim(), telephone: c.telephone.trim() || null, adresse: c.adresse.trim() || null });

export const fromParametres = (p: Parametres) => ({
  boutique: p.boutique.trim(), adresse: p.adresse.trim() || null, telephone: p.telephone.trim() || null, ticket_format: p.ticketFormat,
  remise_max_vendeur: Math.max(0, Math.min(100, Math.round(p.remiseMaxVendeur))), message_ticket: p.messageTicket.trim() || null,
  autorise_pagne: p.autorisePagne, autorise_yard: p.autoriseYard, autorise_metre: p.autoriseMetre,
  quantite_min_panier: Math.max(1, p.quantiteMinPanier), unite_stock: p.uniteStock,
  multi_proprietaires: p.multiProprietaires,
  fidelite_active: p.fideliteActive, fidelite_tranche: Math.max(1, Math.round(p.fideliteTranche)), fidelite_valeur_point: Math.max(1, Math.round(p.fideliteValeurPoint)),
  fidelite_seuil: Math.max(0, Math.round(p.fideliteSeuil)), fidelite_expiration_mois: Math.max(0, Math.round(p.fideliteExpirationMois)),
});

export const fromUser = (u: User) => ({
  nom: u.nom.trim(), email: u.identifiant.trim(), role: u.role, actif: u.actif,
  ...(u.motDePasse.trim() ? { mot_de_passe: u.motDePasse } : {}),
});
