/**
 * Tous les textes de l'interface sont ici. Pour ajouter une langue :
 * créer un dictionnaire (ex. `en`) avec les mêmes clés et l'ajouter à LANGS.
 */
const fr: Record<string, string> = {
  // Commun
  'common.annuler': 'Annuler', 'common.confirmer': 'Confirmer', 'common.enregistrer': 'Enregistrer', 'common.fermer': 'Fermer',
  'common.modifier': 'Modifier', 'common.supprimer': 'Supprimer', 'common.actions': 'Actions', 'common.aucunResultat': 'Aucun résultat pour ces critères.',
  'common.voirPlus': 'Afficher plus', 'common.reessayer': 'Réessayer',
  'ventes.du': 'Du', 'ventes.au': 'Au', 'ventes.compte': 'Affichées : {n} sur {total}',

  // Navigation
  'nav.principale': 'Navigation principale', 'nav.dashboard': 'Tableau de bord', 'nav.caisse': 'Caisse', 'nav.stock': 'Stock', 'nav.ventes': 'Ventes',
  'nav.clients': 'Clients', 'nav.parametres': 'Paramètres', 'nav.deconnexion': 'Se déconnecter', 'nav.replier': 'Réduire le menu', 'nav.deplier': 'Agrandir le menu',

  // Rôles, unités, paiements
  'role.admin': 'Administrateur', 'role.vendeur': 'Vendeur',
  'unite.pagne': 'pagne', 'unite.yard': 'yard',
  'pay.especes': 'Espèces', 'pay.flooz': 'Flooz', 'pay.tmoney': 'T-Money', 'pay.carte': 'Carte',

  // Connexion
  'login.titre': 'Connexion', 'login.sousTitre': 'Entrez vos identifiants pour ouvrir la boutique.', 'login.identifiant': 'Identifiant', 'login.motDePasse': 'Mot de passe',
  'login.connexion': 'Se connecter', 'login.erreur': 'Identifiant ou mot de passe incorrect.', 'login.demo': 'Comptes de démonstration',

  // Tableau de bord
  'dash.titre': 'Tableau de bord', 'dash.sousTitreAdmin': "Vue d'ensemble de la boutique.", 'dash.sousTitreVendeur': 'Vos ventes du jour et les alertes de stock.',
  'dash.indicateurs': 'Indicateurs du jour', 'dash.ventesJour': 'Ventes du jour', 'dash.mesVentesJour': 'Mes ventes du jour', 'dash.caJour': "Chiffre d'affaires du jour",
  'dash.margeJour': 'Marge du jour', 'dash.alertes': 'Alertes de stock', 'dash.courbe': 'Évolution des ventes', 'dash.periode': 'Période', 'dash.7j': '7 jours', 'dash.30j': '30 jours',
  'dash.alertesStock': 'Stock à réapprovisionner', 'dash.voirStock': 'Voir le stock', 'dash.aucuneAlerte': 'Tous les articles sont au-dessus de leur seuil.',
  'dash.topProduits': 'Pagnes les plus vendus', 'dash.parVendeur': "Chiffre d'affaires par vendeur", 'dash.30jours': '30 derniers jours',
  'dash.yardsVendus': '{n} yards vendus', 'dash.dernieres': 'Dernières transactions', 'dash.toutesVentes': 'Toutes les ventes',

  // Stock
  'stock.titre': 'Stock', 'stock.sousTitreAdmin': 'Articles, coloris, entrées et ajustements.', 'stock.sousTitreVendeur': 'Consultation du stock et des prix de vente.',
  'stock.articles': 'Articles', 'stock.mouvements': 'Mouvements', 'stock.nouveauProduit': 'Nouveau produit', 'stock.modifierProduit': 'Modifier le produit',
  'stock.rechercher': 'Rechercher un pagne, un coloris, une référence…', 'stock.tousTypes': 'Tous les types', 'stock.tousMotifs': 'Tous les motifs', 'stock.tousColoris': 'Tous les coloris',
  'stock.toutesOrigines': 'Toutes les origines', 'stock.tousStatuts': 'Tous les statuts', 'stock.type': 'Type', 'stock.motif': 'Motif', 'stock.coloris': 'Coloris', 'stock.origine': 'Origine',
  'stock.statut': 'Statut', 'stock.ok': 'En stock', 'stock.bas': 'Stock bas', 'stock.rupture': 'Rupture', 'stock.article': 'Article', 'stock.stock': 'Stock', 'stock.seuil': 'Seuil',
  'stock.prixVente': 'Prix de vente', 'stock.achat': 'Achat', 'stock.marge': 'marge {n} %', 'stock.compte': '{n} articles affichés', 'stock.entree': 'Entrée de stock',
  'stock.ajuster': 'Ajuster le stock', 'stock.historique': 'Historique', 'stock.supprimerTitre': 'Supprimer ce produit ?',
  'stock.supprimerMsg': '« {nom} » et tous ses coloris seront supprimés du stock. Cette action est définitive.', 'stock.supprime': 'Produit supprimé.',
  'stock.typeMouvement': 'Mouvement', 'stock.tousMouvements': 'Tous les mouvements', 'stock.quantite': 'Quantité', 'stock.utilisateur': 'Utilisateur', 'stock.detail': 'Détail',
  'stock.nom': 'Nom du produit', 'stock.motifEx': 'Ex. : Damier, Floral', 'stock.origineEx': 'Ex. : Ghana, Pays-Bas', 'stock.yardsParPagne': 'Yards par pagne',
  'stock.yardsParPagneHint': 'Longueur d’un pagne complet.', 'stock.unitesVendables': 'Vendu au', 'stock.prixPagne': 'Prix de vente du pagne (FCFA)', 'stock.prixYard': 'Prix de vente du yard (FCFA)',
  'stock.prixYardHint': 'Proposé automatiquement (+20 % par rapport au pagne).', 'stock.prixAchatPagne': "Prix d'achat du pagne (FCFA)", 'stock.variantes': 'Coloris',
  'stock.ajouterColoris': 'Ajouter un coloris', 'stock.couleurs': 'Couleurs', 'stock.couleur1': 'Couleur principale', 'stock.couleur2': "Couleur d'accent", 'stock.sku': 'Référence',
  'stock.skuAuto': 'Automatique', 'stock.seuilYd': 'Seuil (yards)', 'stock.stockInitialYd': 'Stock initial (yards)', 'stock.viaEntree': 'Via « Entrée de stock »',
  'stock.photo': 'Ajouter une photo', 'stock.retirerPhoto': 'Retirer la photo', 'stock.imageErreur': "Impossible de lire cette image.", 'stock.produitAjoute': 'Produit ajouté.',
  'stock.produitModifie': 'Produit modifié.', 'stock.stockActuel': 'stock actuel :', 'stock.unite': 'Unité', 'stock.fournisseur': 'Fournisseur', 'stock.note': 'Note (facultatif)',
  'stock.enregistrerEntree': "Enregistrer l'entrée", 'stock.apercuEntree': 'Ajout de {y} yards. Nouveau stock : {s} yards.', 'stock.entreeOk': '{n} yards ajoutés au stock.',
  'stock.stockCompte': 'Stock compté (yards)', 'stock.motifAjust': "Motif de l'ajustement", 'stock.ecart': 'Écart de {d} yards par rapport au stock enregistré.', 'stock.ajustOk': 'Stock ajusté.',
  'stock.m1': 'Inventaire', 'stock.m2': 'Coupe abîmée', 'stock.m3': 'Erreur de saisie', 'stock.m4': 'Échantillon offert',
  'stock.stockInitial': 'Stock initial', 'stock.reapprovisionnement': 'Réapprovisionnement', 'stock.motifVente': 'Vente {n}', 'stock.motifAnnulation': 'Annulation {n}',
  'mvt.entree': 'Entrée', 'mvt.vente': 'Vente', 'mvt.annulation': 'Annulation', 'mvt.ajustement': 'Ajustement',

  // Caisse
  'caisse.titre': 'Caisse', 'caisse.sousTitre': 'Touchez un pagne pour l’ajouter au panier.', 'caisse.rechercher': 'Rechercher un pagne…', 'caisse.ajouter': 'Ajouter',
  'caisse.panier': 'Panier', 'caisse.panierVide': 'Le panier est vide. Choisissez un pagne dans le catalogue.', 'caisse.vider': 'Vider', 'caisse.quantite': 'Quantité',
  'caisse.remise': 'Remise', 'caisse.typeRemise': 'Type de remise', 'caisse.stockDispo': 'Stock disponible : {n} yards.', 'caisse.client': 'Client', 'caisse.chercherClient': 'Chercher un client…',
  'caisse.passage': 'Client de passage', 'caisse.remiseGlobale': 'Remise sur le total', 'caisse.remiseMaxHint': 'Au-delà de {max} %, la remise doit être accordée par un administrateur.',
  'caisse.marge': 'Marge estimée', 'caisse.paiement': 'Paiement', 'caisse.reference': 'Référence de la transaction', 'caisse.referenceEx': 'Ex. : FZ123456789', 'caisse.recu': 'Montant reçu (FCFA)',
  'caisse.valider': 'Valider la vente', 'caisse.venteValidee': 'Vente {n} validée', 'caisse.nouvelleVente': 'Nouvelle vente',

  // Ticket
  'ticket.numero': 'Ticket n° {n}', 'ticket.vendeur': 'Vendeur', 'ticket.client': 'Client', 'ticket.annule': 'ANNULÉ', 'ticket.remiseLigne': 'Remise', 'ticket.sousTotal': 'Sous-total',
  'ticket.remise': 'Remise', 'ticket.total': 'Total', 'ticket.paiement': 'Paiement', 'ticket.reference': 'Réf.', 'ticket.recu': 'Reçu', 'ticket.rendu': 'Monnaie rendue',
  'ticket.format': 'Format du ticket', 'ticket.thermique': 'Thermique 80 mm', 'ticket.imprimer': 'Imprimer',

  // Ventes
  'ventes.titre': 'Ventes', 'ventes.sousTitreAdmin': 'Historique de toutes les ventes.', 'ventes.sousTitreVendeur': 'Vos ventes.', 'ventes.rechercher': 'Rechercher (n° de ticket, client, pagne…)',
  'ventes.tous': 'Toutes les ventes', 'ventes.validee': 'Validée', 'ventes.annulee': 'Annulée', 'ventes.numero': 'N°', 'ventes.date': 'Date', 'ventes.vendeur': 'Vendeur', 'ventes.client': 'Client',
  'ventes.articles': 'Articles', 'ventes.paiement': 'Paiement', 'ventes.total': 'Total', 'ventes.detail': 'Vente {n}', 'ventes.annuler': 'Annuler la vente', 'ventes.annulerTitre': 'Annuler la vente {n} ?',
  'ventes.annulerMsg': 'Le stock des articles vendus sera remis à jour et la vente ne comptera plus dans le chiffre d’affaires.', 'ventes.motif': "Motif de l'annulation",
  'ventes.confirmerAnnulation': "Confirmer l'annulation", 'ventes.annuleeOk': 'Vente annulée, stock remis à jour.',

  // Clients
  'clients.titre': 'Clients', 'clients.sousTitre': 'Fiches clients et historique d’achats.', 'clients.nouveau': 'Nouveau client', 'clients.modifier': 'Modifier le client',
  'clients.rechercher': 'Rechercher un nom, un téléphone…', 'clients.nom': 'Nom', 'clients.telephone': 'Téléphone', 'clients.adresse': 'Adresse', 'clients.achats': 'Achats',
  'clients.depense': 'Total dépensé', 'clients.dernier': 'Dernier achat', 'clients.compte': '{n} clients', 'clients.ajoute': 'Client ajouté.', 'clients.modifie': 'Client modifié.',
  'clients.supprimerTitre': 'Supprimer ce client ?', 'clients.supprimerMsg': 'La fiche de {nom} sera supprimée. Ses ventes restent dans l’historique.', 'clients.supprime': 'Client supprimé.',

  // Paramètres
  'param.titre': 'Paramètres', 'param.sousTitre': 'Boutique, ticket et utilisateurs.', 'param.boutique': 'Boutique', 'param.nom': 'Nom', 'param.adresse': 'Adresse', 'param.telephone': 'Téléphone',
  'param.messageTicket': 'Message en bas du ticket', 'param.formatTicket': 'Format de ticket par défaut', 'param.remiseMax': 'Remise maximale du vendeur (%)',
  'param.remiseMaxHint': 'Seul un administrateur peut dépasser ce seuil.', 'param.enregistre': 'Paramètres enregistrés.', 'param.utilisateurs': 'Utilisateurs', 'param.ajouterUtilisateur': 'Ajouter un utilisateur',
  'param.modifierUtilisateur': "Modifier l'utilisateur", 'param.role': 'Rôle', 'param.actif': 'Actif', 'param.inactif': 'Désactivé', 'param.compteActif': 'Compte actif', 'param.utilisateurOk': 'Utilisateur enregistré.',
  'param.securiteNote': "Les droits sont appliqués par le serveur. Un compte désactivé, ou dont le rôle ou le mot de passe change, est déconnecté aussitôt.",
  'param.mdpMin': '6 caractères minimum.', 'param.mdpGarder': 'Laisser vide pour conserver le mot de passe actuel.',
  'app.chargement': 'Chargement…',

  // Erreurs
  'err.nomProduit': 'Le nom du produit est obligatoire.', 'err.uniteVente': 'Choisissez au moins une unité de vente (pagne ou yard).', 'err.yardsParPagne': 'Le nombre de yards par pagne doit être supérieur à 0.',
  'err.prix': 'Indiquez un prix de vente pour chaque unité vendable.', 'err.coloris': 'Ajoutez au moins un coloris et donnez un nom à chacun.',
  'err.colorisVendu': 'Le coloris « {coloris} » a déjà été vendu : il ne peut pas être supprimé.', 'err.produitVendu': 'Ce produit a déjà été vendu. Mettez son stock à zéro plutôt que de le supprimer.',
  'err.introuvable': 'Élément introuvable.', 'err.quantite': 'Indiquez une quantité valide.', 'err.motifRequis': 'Le motif est obligatoire.', 'err.aucunEcart': 'Le stock compté est identique au stock enregistré.',
  'err.session': 'Votre session a expiré. Reconnectez-vous.', 'err.panierVide': 'Le panier est vide.', 'err.stockInsuffisant': 'Stock insuffisant pour {nom} — {coloris} : {stock} yards disponibles.',
  'err.remiseMax': 'Remise trop élevée : au-delà de {max} %, un administrateur est requis.', 'err.reference': 'La référence de la transaction est obligatoire pour le mobile money.',
  'err.recuInsuffisant': 'Le montant reçu est inférieur au total.', 'err.dejaAnnulee': 'Cette vente est déjà annulée.', 'err.nomClient': 'Le nom du client est obligatoire.',
  'err.inattendue': 'Une erreur inattendue est survenue. Réessayez.', 'err.mdpCourt': 'Le mot de passe doit contenir au moins 6 caractères.',
  'err.champsUtilisateur': 'Nom, identifiant et mot de passe sont obligatoires.', 'err.identifiantPris': 'Cet identifiant est déjà utilisé.', 'err.dernierAdmin': 'Il doit toujours rester un administrateur actif.',
};

const LANGS: Record<string, Record<string, string>> = { fr };
let current = 'fr';
export const setLang = (l: string) => { if (LANGS[l]) current = l; };

export function t(key: string, vars?: Record<string, string>): string {
  const s = LANGS[current][key] ?? fr[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

/** « pagne(s) » / « yard(s) » avec accord au pluriel (pluriel dès que la quantité dépasse 1). */
export const uniteLabel = (u: 'pagne' | 'yard', q: number) => t('unite.' + u) + (q > 1 ? 's' : '');
