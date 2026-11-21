import React from 'react';
import { LuCloudOff, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { useUI } from './ui';
import { fcfa, fmtDateTime, num } from '../lib/format';
import { referenceProvisoire } from '../lib/horsLigne';
import type { Anomalie } from '../types';

/**
 * Bandeau de la caisse hors ligne, en haut de l'espace boutique : réseau absent (la caisse vend avec le
 * catalogue gardé), ventes qui attendent d'être envoyées, et celles que le serveur a refusées.
 */
export function BandeauHorsLigne() {
  const { horsLigne, catalogueDu, enAttente, synchroniser, retirerVenteEnAttente } = useApp();
  const { confirm, toast } = useUI();
  const refusees = enAttente.filter(e => e.erreur);
  if (!horsLigne && enAttente.length === 0) return null;

  const retirer = async (uuid: string, ref: string) => {
    if (!(await confirm({ title: t('hl.retirerTitre', { ref }), message: t('hl.retirerMsg'), confirmLabel: t('hl.retirer'), danger: true }))) return;
    retirerVenteEnAttente(uuid);
    toast(t('hl.retiree', { ref }));
  };

  return (
    <div className={horsLigne ? 'offline-band is-offline' : 'offline-band'} role="status">
      <div className="offline-head">
        {horsLigne ? <LuCloudOff aria-hidden="true" /> : <LuRefreshCw aria-hidden="true" />}
        <div className="grow">
          <strong>{horsLigne ? t('hl.titre') : t('hl.enAttenteTitre', { n: String(enAttente.length) })}</strong>
          <div className="muted-s">
            {horsLigne
              ? <>{t('hl.message')}{catalogueDu && <> {t('hl.catalogueDu', { d: fmtDateTime(catalogueDu) })}</>}{enAttente.length > 0 && <> · {t('hl.enAttente', { n: String(enAttente.length) })}</>}</>
              : t('hl.envoiAuto')}
          </div>
        </div>
        {!horsLigne && enAttente.length > 0 && <button className="btn btn-sm" type="button" onClick={() => void synchroniser()}><LuRefreshCw /> {t('hl.envoyer')}</button>}
      </div>
      {refusees.length > 0 && (
        <ul className="offline-errors">
          {refusees.map(e => {
            const ref = referenceProvisoire(e.uuid);
            return (
              <li key={e.uuid}>
                <LuTriangleAlert aria-hidden="true" />
                <span className="grow"><strong>{ref}</strong> · {fmtDateTime(e.vente.date)} · {fcfa(e.vente.total)} — {e.erreur}</span>
                <button className="btn btn-sm" type="button" onClick={() => void retirer(e.uuid, ref)}>{t('hl.retirer')}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Texte d'une anomalie constatée par le serveur à la réception d'une vente hors ligne. */
export function texteAnomalie(a: Anomalie): string {
  switch (a.type) {
    case 'stock': return t('hl.a.stock', { produit: a.produit ?? '', coloris: a.coloris ?? '', n: `${num(a.manque ?? 0)} ${a.unite ? uniteLabel(a.unite, a.manque ?? 0) : ''}`.trim() });
    case 'ecart': return t('hl.a.ecart', { encaisse: fcfa(a.encaisse ?? 0), calcule: fcfa(a.calcule ?? 0) });
    case 'remise': return t('hl.a.remise', { pct: String(a.pct ?? 0), max: String(a.max ?? 0) });
    case 'unite': return t('hl.a.unite', { produit: a.produit ?? '' });
    default: return t('hl.a.minimum');
  }
}
