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
  'nav.clients': 'Clients', 'nav.parametres': 'Paramètres', 'nav.proprietaires': 'Propriétaires', 'nav.promotions': 'Promotions', 'nav.deconnexion': 'Se déconnecter', 'nav.replier': 'Réduire le menu', 'nav.deplier': 'Agrandir le menu',

  // Rôles, unités, paiements
  'role.admin': 'Administrateur', 'role.vendeur': 'Vendeur', 'role.tenant_admin': 'Tenant Admin', 'role.boutique_admin': 'Boutique Admin', 'role.super_admin': 'Super Admin',
  'unite.pagne': 'pagne', 'unite.yard': 'yard', 'unite.metre': 'mètre',
  'pay.especes': 'Espèces', 'pay.flooz': 'Flooz', 'pay.tmoney': 'T-Money', 'pay.carte': 'Carte',
  'billing.status.active': 'Actif', 'billing.status.trial': 'Essai', 'billing.status.expired': 'Expiré',
  'billing.status.cancelled': 'Annulé', 'billing.status.suspended': 'Suspendu', 'billing.status.inactive': 'Inactif',
  'billing.status.pending': 'En attente', 'billing.status.none': 'Aucun', 'billing.status.paid': 'Payé',
  'billing.status.unpaid': 'Non payé', 'billing.status.rejected': 'Rejeté',
  'billing.method.cash': 'Espèces', 'billing.method.flooz': 'Flooz', 'billing.method.tmoney': 'T-Money',
  'billing.method.card': 'Carte', 'billing.method.manual': 'Manuel',

  // Connexion
  'login.titre': 'Connexion', 'login.sousTitre': 'Entrez vos identifiants. Votre espace s’ouvrira selon votre rôle.', 'login.marque': 'Pagnes de Lomé · Gestion', 'login.identifiant': 'Identifiant', 'login.motDePasse': 'Mot de passe',
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
  'stock.prixMetre': 'Prix de vente du mètre (FCFA)', 'stock.prixMetreHint': 'Proposé automatiquement à partir du prix au yard (1 yard = 0,9144 m).',
  'stock.uniteNonAutorisee': 'Non autorisé par la politique de vente de la boutique (Paramètres).',
  'stock.prixYardHint': 'Proposé automatiquement (+20 % par rapport au pagne).', 'stock.prixAchatPagne': "Prix d'achat du pagne (FCFA)", 'stock.variantes': 'Coloris',
  'stock.ajouterColoris': 'Ajouter un coloris', 'stock.couleurs': 'Couleurs', 'stock.couleur1': 'Couleur principale', 'stock.couleur2': "Couleur d'accent", 'stock.sku': 'Référence',
  'stock.skuAuto': 'Automatique', 'stock.seuilYd': 'Seuil ({unite})', 'stock.stockInitialYd': 'Stock initial ({unite})', 'stock.viaEntree': 'Via « Entrée de stock »',
  'stock.photo': 'Ajouter une photo', 'stock.retirerPhoto': 'Retirer la photo', 'stock.imageErreur': "Impossible de lire cette image.", 'stock.photoEchec': 'Produit enregistré, mais la photo a été refusée : {msg}', 'stock.produitAjoute': 'Produit ajouté.',
  'stock.produitModifie': 'Produit modifié.', 'stock.stockActuel': 'stock actuel :', 'stock.unite': 'Unité', 'stock.fournisseur': 'Fournisseur', 'stock.note': 'Note (facultatif)',
  'stock.enregistrerEntree': "Enregistrer l'entrée", 'stock.apercuEntree': 'Ajout de {y} {unite}. Nouveau stock : {s} {unite}.', 'stock.entreeOk': '{n} {unite} ajouté(s) au stock.',
  'stock.stockCompte': 'Stock compté ({unite})', 'stock.motifAjust': "Motif de l'ajustement", 'stock.ecart': 'Écart de {d} {unite} par rapport au stock enregistré.', 'stock.ajustOk': 'Stock ajusté.',
  'stock.m1': 'Inventaire', 'stock.m2': 'Coupe abîmée', 'stock.m3': 'Erreur de saisie', 'stock.m4': 'Échantillon offert',
  'stock.stockInitial': 'Stock initial', 'stock.reapprovisionnement': 'Réapprovisionnement', 'stock.motifVente': 'Vente {n}', 'stock.motifAnnulation': 'Annulation {n}',
  'mvt.entree': 'Entrée', 'mvt.vente': 'Vente', 'mvt.annulation': 'Annulation', 'mvt.ajustement': 'Ajustement',

  // Caisse
  'caisse.titre': 'Caisse', 'caisse.sousTitre': 'Touchez un pagne pour l’ajouter au panier.', 'caisse.rechercher': 'Rechercher un pagne…', 'caisse.ajouter': 'Ajouter',
  'caisse.panier': 'Panier', 'caisse.panierVide': 'Le panier est vide. Choisissez un pagne dans le catalogue.', 'caisse.vider': 'Vider', 'caisse.quantite': 'Quantité',
  'caisse.remise': 'Remise', 'caisse.typeRemise': 'Type de remise', 'caisse.stockDispo': 'Stock disponible : {n} {unite}.', 'caisse.minimumHint': 'Vente au gros : {n} pagne(s) minimum par vente.', 'caisse.client': 'Client', 'caisse.chercherClient': 'Chercher un client…',
  'caisse.passage': 'Client de passage', 'caisse.remiseGlobale': 'Remise sur le total', 'caisse.remiseMaxHint': 'Au-delà de {max} %, la remise doit être accordée par un administrateur.',
  'caisse.marge': 'Marge estimée', 'caisse.paiement': 'Paiement', 'caisse.reference': 'Référence de la transaction', 'caisse.referenceEx': 'Ex. : FZ123456789', 'caisse.recu': 'Montant reçu (FCFA)',
  'caisse.dontPromotions': 'Promotions appliquées',
  'caisse.valider': 'Valider la vente', 'caisse.venteValidee': 'Vente {n} validée', 'caisse.nouvelleVente': 'Nouvelle vente',

  // Ticket
  'ticket.numero': 'Ticket n° {n}', 'ticket.vendeur': 'Vendeur', 'ticket.client': 'Client', 'ticket.annule': 'ANNULÉ', 'ticket.remiseLigne': 'Remise', 'ticket.promo': 'Promo {nom}', 'ticket.sousTotal': 'Sous-total',
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
  'param.politique': 'Politique de vente', 'param.unitesAutorisees': 'Unités de vente autorisées',
  'param.unitesHint': 'Seules ces unités sont proposées à la caisse et dans les fiches produit.',
  'param.quantiteMin': 'Quantité minimale par vente (pagnes)',
  'param.quantiteMinHint': 'Pour la vente au gros : s’applique au panier entier, uniquement si seul le pagne est autorisé.',
  'param.quantiteMinInactif': 'Inactive : la boutique vend aussi au yard ou au mètre.',
  'param.uniteStock': 'Unité de stock', 'param.uniteStockHint': 'Unité dans laquelle le stock et les mouvements sont comptés.',
  'param.uniteStockConfirm': 'Changer l’unité de stock convertit le stock, les seuils et l’historique de tous les coloris de la boutique. Continuer ?',
  'param.multiProprietaires': 'Plusieurs propriétaires du stock',
  'param.multiProprietairesHint': 'Pour une boutique tenue à plusieurs : chaque pagne appartient à une personne, et les ventes et le stock sont suivis par propriétaire.',

  // Propriétaires
  'prop.titre': 'Propriétaires du stock', 'prop.sousTitre': 'Qui possède quels pagnes, et ce qui revient à chacun.',
  'prop.gestion': 'Propriétaires', 'prop.gestionHint': 'Chaque motif attribué revient automatiquement à son propriétaire, y compris pour les produits déjà en stock.',
  'prop.ajouter': 'Ajouter un propriétaire', 'prop.modifier': 'Modifier le propriétaire', 'prop.nom': 'Nom', 'prop.compte': 'Compte lié (facultatif)',
  'prop.aucunCompte': 'Aucun compte', 'prop.motifs': 'Motifs qui lui appartiennent', 'prop.motifsHint': 'Tapez un motif puis Entrée. Les produits de ces motifs lui sont attribués.',
  'prop.ajouterMotif': 'Ajouter un motif…', 'prop.actif': 'Actif', 'prop.inactif': 'Désactivé', 'prop.compteActif': 'Propriétaire actif',
  'prop.produits': '{n} produit(s)', 'prop.aucunMotif': 'Aucun motif : attribution à la main dans la fiche produit.', 'prop.aucun': 'Aucun propriétaire pour l’instant.',
  'prop.enregistre': 'Propriétaire enregistré.', 'prop.supprime': 'Propriétaire supprimé.',
  'prop.supprimerTitre': 'Supprimer {nom} ?', 'prop.supprimerMsg': 'Ses produits deviendront « non attribués ». Impossible s’il a déjà des ventes : désactivez-le alors.',
  'prop.nonAttribue': 'Non attribué', 'prop.tous': 'Tous les propriétaires', 'prop.proprietaire': 'Propriétaire',
  'prop.selonMotif': 'Selon le motif', 'prop.selonMotifHint': 'Ce motif revient à {nom}.', 'prop.sansRegle': 'Aucune règle pour ce motif : choisissez un propriétaire ou laissez « non attribué ».',
  'prop.periode': 'Période', 'prop.du': 'Du', 'prop.au': 'Au',
  'prop.encaisse': 'Encaissé pour ses pagnes', 'prop.encaisseHint': 'Net des remises : ce qui lui revient sur la période.',
  'prop.tickets': '{n} ticket(s)', 'prop.marge': 'Marge', 'prop.vendu': 'Vendu', 'prop.enStock': 'En stock', 'prop.valeurStock': 'Valeur du stock (au prix d’achat)',
  'prop.ruptures': '{n} rupture(s)', 'prop.coloris': '{n} coloris', 'prop.total': 'Total encaissé sur la période',
  'prop.desactive': 'L’option « Plusieurs propriétaires du stock » est désactivée pour cette boutique.', 'prop.activer': 'L’activer dans les paramètres',
  'param.mdpMin': '6 caractères minimum.', 'param.mdpGarder': 'Laisser vide pour conserver le mot de passe actuel.',
  'app.chargement': 'Chargement…',

  // Erreurs
  'err.nomProduit': 'Le nom du produit est obligatoire.', 'err.uniteVente': 'Choisissez au moins une unité de vente.', 'err.yardsParPagne': 'Le nombre de yards par pagne doit être supérieur à 0.',
  'err.prix': 'Indiquez un prix de vente pour chaque unité vendable.', 'err.coloris': 'Ajoutez au moins un coloris et donnez un nom à chacun.',
  'err.colorisVendu': 'Le coloris « {coloris} » a déjà été vendu : il ne peut pas être supprimé.', 'err.produitVendu': 'Ce produit a déjà été vendu. Mettez son stock à zéro plutôt que de le supprimer.',
  'err.introuvable': 'Élément introuvable.', 'err.quantite': 'Indiquez une quantité valide.', 'err.motifRequis': 'Le motif est obligatoire.', 'err.aucunEcart': 'Le stock compté est identique au stock enregistré.',
  'err.session': 'Votre session a expiré. Reconnectez-vous.', 'err.panierVide': 'Le panier est vide.', 'err.stockInsuffisant': 'Stock insuffisant pour {nom} — {coloris} : {stock} {unite} disponible(s).',
  'err.quantiteMinPanier': 'Quantité minimale par vente : {n} pagne(s).', 'err.nomProprietaire': 'Le nom du propriétaire est obligatoire.', 'err.nomPromotion': 'Donnez un nom à la promotion.',
  'err.fideliteInactive': 'Le programme de fidélité n’est pas activé dans cette boutique.', 'err.pointsSansClient': 'Choisissez le client dont les points sont utilisés.',
  'err.pointsSeuil': 'Il faut utiliser au moins {n} points.', 'err.pointsSolde': 'Solde insuffisant : {nom} n’a que {n} points.',
  'err.pointsTrop': 'Trop de points pour ce ticket : au plus {n} points.', 'err.pointsAjust': 'Indiquez un nombre de points et un motif.',

  // Fidélité
  'fid.titre': 'Fidélité', 'fid.sous': 'Le client gagne des points sur ce qu’il paie et les échange contre une remise.',
  'fid.activer': 'Activer le programme de fidélité', 'fid.tranche': 'Montant payé pour gagner 1 point (FCFA)', 'fid.valeur': 'Valeur d’un point utilisé (FCFA)',
  'fid.seuil': 'Points minimum pour en utiliser', 'fid.expiration': 'Solde perdu après (mois sans achat)', 'fid.expirationHint': '0 : les points n’expirent jamais. Chaque achat relance le délai.',
  'fid.exemple': 'Exemple : un achat de {achat} rapporte {pts} points ; {seuil} points font une remise de {remise}. Cela revient à rendre {taux} % des achats.',
  'fid.solde': '{n} points', 'fid.soldeValeur': 'soit {v} de remise', 'fid.utiliser': 'Points à utiliser', 'fid.max': 'Max', 'fid.dispo': 'Utilisable dès {n} points.',
  'fid.remise': 'Points fidélité', 'fid.gagnera': 'Le client gagnera {n} point(s).', 'fid.gagnes': 'Points gagnés', 'fid.utilises': '{n} points utilisés',
  'fid.historique': 'Historique des points', 'fid.ajuster': 'Ajouter ou retirer des points', 'fid.points': 'Points (négatif pour retirer)', 'fid.motif': 'Motif',
  'fid.motifEx': 'Ex. : geste commercial, erreur de caisse', 'fid.ajusteOk': 'Solde mis à jour.', 'fid.aucunMouvement': 'Aucun mouvement de points.',
  'fid.t.gain': 'Gain', 'fid.t.utilisation': 'Utilisation', 'fid.t.annulation': 'Annulation', 'fid.t.ajustement': 'Ajustement', 'fid.t.expiration': 'Expiration',
  'fid.colonne': 'Points', 'fid.negatif': 'Solde négatif : des points déjà dépensés ont été retirés après l’annulation d’une vente.',

  // Promotions
  'promo.titre': 'Promotions', 'promo.sousTitre': 'Remises appliquées automatiquement à la caisse : une par article, la plus avantageuse pour le client.',
  'promo.nouvelle': 'Nouvelle promotion', 'promo.modifier': 'Modifier la promotion', 'promo.nom': 'Nom affiché sur le ticket', 'promo.nomEx': 'Ex. : Spécial Tabaski',
  'promo.remise': 'Remise', 'promo.pct': 'Pourcentage', 'promo.fcfa': 'FCFA par unité', 'promo.valeurPct': 'Pourcentage (%)', 'promo.valeurFcfa': 'Montant retiré par unité (FCFA)',
  'promo.cible': 'S’applique à', 'promo.c.tout': 'Tout le catalogue', 'promo.c.type': 'Un type de pagne', 'promo.c.motif': 'Un motif', 'promo.c.produit': 'Un produit', 'promo.c.variante': 'Un coloris',
  'promo.choisir': 'Choisir…', 'promo.unite': 'Unité', 'promo.toutesUnites': 'Toutes les unités', 'promo.uniteHint': 'Obligatoire pour une remise en FCFA ou une quantité minimale.',
  'promo.quantiteMin': 'À partir de (quantité sur le panier)', 'promo.quantiteMinHint': 'Ex. 3 : la remise s’applique dès 3 articles visés dans le panier, tous coloris confondus. 0 : dès le premier.',
  'promo.debut': 'Début', 'promo.fin': 'Fin', 'promo.datesHint': 'Laissez vide pour une promotion sans limite de date.', 'promo.active': 'Promotion active',
  'promo.enregistree': 'Promotion enregistrée.', 'promo.supprimee': 'Promotion supprimée.', 'promo.supprimerTitre': 'Supprimer « {nom} » ?',
  'promo.supprimerMsg': 'Elle ne sera plus appliquée. Les tickets déjà émis gardent son nom et sa remise.', 'promo.aucune': 'Aucune promotion pour l’instant.',
  'promo.s.encours': 'En cours', 'promo.s.avenir': 'À venir', 'promo.s.terminee': 'Terminée', 'promo.s.inactive': 'Désactivée',
  'promo.des': 'dès {n}', 'promo.parUnite': '/ {unite}', 'promo.depuis': 'depuis le {d}', 'promo.jusqua': 'jusqu’au {d}', 'promo.duAu': 'du {d} au {f}', 'promo.sansDate': 'Sans limite de date', 'err.uniteAutorisee': 'Autorisez au moins une unité de vente.',
  'err.remiseMax': 'Remise trop élevée : au-delà de {max} %, un administrateur est requis.', 'err.reference': 'La référence de la transaction est obligatoire pour le mobile money.',
  'err.recuInsuffisant': 'Le montant reçu est inférieur au total.', 'err.dejaAnnulee': 'Cette vente est déjà annulée.', 'err.nomClient': 'Le nom du client est obligatoire.',
  'err.inattendue': 'Une erreur inattendue est survenue. Réessayez.', 'err.mdpCourt': 'Le mot de passe doit contenir au moins 6 caractères.',
  'err.champsUtilisateur': 'Nom, identifiant et mot de passe sont obligatoires.', 'err.identifiantPris': 'Cet identifiant est déjà utilisé.', 'err.dernierAdmin': 'Il doit toujours rester un administrateur actif.',

  // Ajouts de présentation (refonte visuelle)
  'caisse.voirPanier': 'Voir le panier', 'caisse.nbArticles': '{n} article(s) au panier', 'caisse.venteEnregistree': 'Vente enregistrée',
  'param.politiqueSous': 'Ce que la caisse propose et comment le stock est compté.', 'param.ticketSous': 'Coordonnées imprimées sur le ticket et règles de remise.',
  'param.utilisateursSous': 'Comptes qui peuvent se connecter à cette boutique.',
  'login.accroche': 'Caisse, stock et ventes de votre boutique de pagnes, au comptoir comme au bureau.',
};

const LANGS: Record<string, Record<string, string>> = { fr };
let current = 'fr';
export const setLang = (l: string) => { if (LANGS[l]) current = l; };

export function t(key: string, vars?: Record<string, string>): string {
  const s = LANGS[current][key] ?? fr[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

/** « pagne(s) » / « yard(s) » / « mètre(s) » avec accord au pluriel (pluriel dès que la quantité dépasse 1). */
export const uniteLabel = (u: 'pagne' | 'yard' | 'metre', q: number) => t('unite.' + u) + (q > 1 ? 's' : '');
