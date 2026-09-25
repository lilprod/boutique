import React from 'react';
import type { Vente } from '../types';
import { useApp } from '../store';
import { fcfa, fmtDateTime, num, numeroVente } from '../lib/format';
import { t, uniteLabel } from '../i18n';

export function Ticket({ vente, format }: { vente: Vente; format: '80mm' | 'A4' }) {
  const { db } = useApp();
  const p = db.parametres;
  const vendeur = db.users.find(u => u.id === vente.vendeurId);
  const client = db.clients.find(c => c.id === vente.clientId);
  const rendu = vente.paiement.recu ? vente.paiement.recu - vente.total : 0;
  return (
    <div className={'ticket ' + (format === 'A4' ? 'a4' : 'w80')}>
      <div className="t-head">
        <h3>{p.boutique}</h3>
        <div>{p.adresse}</div>
        <div>{p.telephone}</div>
      </div>
      <div className="t-meta">
        <div><strong>{t('ticket.numero', { n: numeroVente(vente.numero) })}</strong></div>
        <div>{fmtDateTime(vente.date)}</div>
        <div>{t('ticket.vendeur')} : {vendeur?.nom ?? '—'}</div>
        {client && <div>{t('ticket.client')} : {client.nom}</div>}
      </div>
      {vente.statut === 'annulee' && <div className="t-stamp">{t('ticket.annule')}</div>}
      <div className="t-lines">
        {vente.lignes.map((l, i) => (
          <div className="t-line" key={i}>
            <div className="t-name">{l.libelle} — {l.coloris}</div>
            <div className="t-calc">
              <span>{num(l.quantite)} {uniteLabel(l.unite, l.quantite)} × {fcfa(l.prixUnitaire)}</span>
              <span>{fcfa(l.brut)}</span>
            </div>
            {l.brut > l.total && <div className="t-calc t-disc"><span>{t('ticket.remiseLigne')}</span><span>−{fcfa(l.brut - l.total)}</span></div>}
          </div>
        ))}
      </div>
      <div className="t-tot">
        {(vente.remiseMontant > 0 || vente.lignes.some(l => l.brut > l.total)) && <div><span>{t('ticket.sousTotal')}</span><span>{fcfa(vente.sousTotal)}</span></div>}
        {vente.remiseMontant > 0 && <div><span>{t('ticket.remise')}</span><span>−{fcfa(vente.remiseMontant)}</span></div>}
        <div className="t-grand"><span>{t('ticket.total')}</span><span>{fcfa(vente.total)}</span></div>
        <div><span>{t('ticket.paiement')}</span><span>{t('pay.' + vente.paiement.mode)}</span></div>
        {vente.paiement.reference && <div><span>{t('ticket.reference')}</span><span>{vente.paiement.reference}</span></div>}
        {vente.paiement.recu ? <><div><span>{t('ticket.recu')}</span><span>{fcfa(vente.paiement.recu)}</span></div><div><span>{t('ticket.rendu')}</span><span>{fcfa(Math.max(0, rendu))}</span></div></> : null}
      </div>
      <div className="t-foot">{p.messageTicket}</div>
    </div>
  );
}
