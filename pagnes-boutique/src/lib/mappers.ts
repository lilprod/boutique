/** Conversions entre le JSON de l'API Laravel (snake_case, ids numériques) et les types du frontend (camelCase, ids texte). */
import type { Client, LigneVente, ModePaiement, Mouvement, Parametres, Produit, Role, User, Variante, Vente } from '../types';
import type { VarForm, VenteInput } from '../store';

const s = (id: unknown) => String(id);
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const toProduit = (p: any): Produit => ({
  id: s(p.id), nom: p.nom, type: p.type, motif: p.motif ?? '', origine: p.origine ?? '', image: p.image_url ?? undefined, // adresse du fichier
  yardsParPagne: n(p.yards_par_pagne), vendPagne: !!p.vend_pagne, vendYard: !!p.vend_yard,
  prixPagne: n(p.prix_pagne), prixYard: n(p.prix_yard),
  // Le prix d'achat n'est envoyé qu'à l'administrateur.
  prixAchatPagne: n(p.prix_achat_pagne),
});

export const toVariante = (v: any): Variante => ({
  id: s(v.id), produitId: s(v.produit_id), coloris: v.coloris, sku: v.sku, c1: v.c1, c2: v.c2, stock: n(v.stock), seuil: n(v.seuil),
});

export const toClient = (c: any): Client => ({
  id: s(c.id), nom: c.nom, telephone: c.telephone ?? '', adresse: c.adresse ?? '', creeLe: c.created_at,
  achats: n(c.achats), depense: n(c.depense), derniereVente: c.derniere_vente ?? undefined,
});

const toLigne = (l: any): LigneVente => ({
  varianteId: s(l.variante_id), produitId: s(l.produit_id), libelle: l.libelle, coloris: l.coloris, unite: l.unite,
  quantite: n(l.quantite), yards: n(l.yards), prixUnitaire: n(l.prix_unitaire), brut: n(l.brut),
  remise: { type: l.remise_type, valeur: n(l.remise_valeur) }, total: n(l.total),
  cout: n(l.cout), // absent pour un vendeur (jamais affiché)
});

export const toVente = (v: any): Vente => ({
  id: s(v.id), numero: n(v.numero), date: v.created_at, vendeurId: s(v.vendeur_id), vendeurNom: v.vendeur?.nom,
  clientId: v.client_id == null ? undefined : s(v.client_id), clientNom: v.client?.nom,
  lignes: (v.lignes ?? []).map(toLigne), sousTotal: n(v.sous_total), remise: { type: v.remise_type, valeur: n(v.remise_valeur) },
  remiseMontant: n(v.remise_montant), total: n(v.total), marge: n(v.marge),
  paiement: { mode: v.paiement_mode as ModePaiement, reference: v.paiement_reference ?? undefined, recu: v.paiement_recu ?? undefined },
  statut: v.statut,
  annulation: v.statut === 'annulee' ? { date: v.annulation_date, userId: s(v.annulation_user_id), motif: v.annulation_motif ?? '' } : undefined,
});

export const toMouvement = (m: any): Mouvement => ({
  id: s(m.id), date: m.created_at, varianteId: s(m.variante_id), type: m.type, yards: n(m.yards), userId: s(m.user_id), userNom: m.utilisateur?.nom, motif: m.motif,
  fournisseur: m.fournisseur ?? undefined, prixAchatPagne: m.prix_achat_pagne ?? undefined, venteId: m.vente_id == null ? undefined : s(m.vente_id),
});

export const toParametres = (p: any): Parametres => ({
  boutique: p.boutique, adresse: p.adresse ?? '', telephone: p.telephone ?? '', ticketFormat: p.ticket_format,
  remiseMaxVendeur: n(p.remise_max_vendeur), messageTicket: p.message_ticket ?? '',
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
  yards_par_pagne: p.yardsParPagne, vend_pagne: p.vendPagne, vend_yard: p.vendYard,
  prix_pagne: Math.round(p.prixPagne), prix_yard: Math.round(p.prixYard), prix_achat_pagne: Math.round(p.prixAchatPagne),
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
});

export const fromClient = (c: Client) => ({ nom: c.nom.trim(), telephone: c.telephone.trim() || null, adresse: c.adresse.trim() || null });

export const fromParametres = (p: Parametres) => ({
  boutique: p.boutique.trim(), adresse: p.adresse.trim() || null, telephone: p.telephone.trim() || null, ticket_format: p.ticketFormat,
  remise_max_vendeur: Math.max(0, Math.min(100, Math.round(p.remiseMaxVendeur))), message_ticket: p.messageTicket.trim() || null,
});

export const fromUser = (u: User) => ({
  nom: u.nom.trim(), email: u.identifiant.trim(), role: u.role, actif: u.actif,
  ...(u.motDePasse.trim() ? { mot_de_passe: u.motDePasse } : {}),
});
