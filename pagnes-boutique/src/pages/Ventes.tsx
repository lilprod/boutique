import React, { useState } from 'react';
import { LuBan, LuSearch } from 'react-icons/lu';
import type { Vente } from '../types';
import { useApp } from '../store';
import { get } from '../api';
import { t } from '../i18n';
import { Badge, Empty, Field, Modal, useUI } from '../components/ui';
import { TicketModal } from '../components/TicketModal';
import { fcfa, fmtDateTime, numeroVente } from '../lib/format';
import { toVente } from '../lib/mappers';
import { useDebounced, usePaged } from '../lib/usePaged';

export default function Ventes() {
  const { user, annulerVente } = useApp();
  const { toast } = useUI();
  const admin = user!.role === 'admin';
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [sel, setSel] = useState<Vente | null>(null);
  const [cancel, setCancel] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  // Recherche, statut et dates sont appliqués par le serveur ; un vendeur n'y trouve que ses propres ventes.
  const list = usePaged<Vente>('/ventes', { q: useDebounced(q.trim()), statut, du, au }, toVente);

  const doCancel = async () => {
    if (busy || !sel) return;
    setBusy(true);
    const r = await annulerVente(sel.id, motif);
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('ventes.annuleeOk')); setCancel(false); setMotif('');
    void list.reload();
    try { setSel(toVente(await get(`/ventes/${sel.id}`))); } catch { setSel(null); } // le ticket affiche le tampon « annulé »
  };

  return (
    <>
      <div className="page-head"><div><h1>{t('ventes.titre')}</h1><p className="muted-p">{admin ? t('ventes.sousTitreAdmin') : t('ventes.sousTitreVendeur')}</p></div></div>
      <section className="panel">
        <div className="filters">
          <div className="search"><LuSearch /><input className="input" placeholder={t('ventes.rechercher')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('ventes.rechercher')} /></div>
          <select className="select" value={statut} onChange={e => setStatut(e.target.value)} aria-label={t('stock.statut')}>
            <option value="">{t('ventes.tous')}</option><option value="validee">{t('ventes.validee')}</option><option value="annulee">{t('ventes.annulee')}</option>
          </select>
          <label className="date-filter"><span className="muted-s">{t('ventes.du')}</span><input className="input" type="date" value={du} max={au || undefined} onChange={e => setDu(e.target.value)} aria-label={t('ventes.du')} /></label>
          <label className="date-filter"><span className="muted-s">{t('ventes.au')}</span><input className="input" type="date" value={au} min={du || undefined} onChange={e => setAu(e.target.value)} aria-label={t('ventes.au')} /></label>
        </div>
        <div className="table-wrap">
          <table className="tbl clickable">
            <thead><tr><th>{t('ventes.numero')}</th><th>{t('ventes.date')}</th><th>{t('ventes.vendeur')}</th><th>{t('ventes.client')}</th><th className="r">{t('ventes.articles')}</th><th>{t('ventes.paiement')}</th><th className="r">{t('ventes.total')}</th><th>{t('stock.statut')}</th></tr></thead>
            <tbody>
              {list.rows.map(v => (
                <tr key={v.id} className={v.statut === 'annulee' ? 'struck' : ''} onClick={() => setSel(v)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSel(v); }}>
                  <td className="strong">{numeroVente(v.numero)}</td><td>{fmtDateTime(v.date)}</td>
                  <td>{v.vendeurNom ?? '—'}</td><td>{v.clientNom ?? '—'}</td>
                  <td className="r">{v.lignes.length}</td><td>{t('pay.' + v.paiement.mode)}</td><td className="r strong">{fcfa(v.total)}</td>
                  <td><Badge kind={v.statut === 'validee' ? 'ok' : 'mute'}>{t('ventes.' + v.statut)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.error && <div role="alert" className="pad"><p className="error">{list.error}</p><button className="btn btn-sm" onClick={() => void list.reload()}>{t('common.reessayer')}</button></div>}
          {!list.error && list.loading && list.rows.length === 0 && <p className="muted-p pad" role="status">{t('app.chargement')}</p>}
          {!list.error && !list.loading && list.rows.length === 0 && <Empty title={t('common.aucunResultat')} />}
        </div>
        {list.rows.length > 0 && (
          <div className="table-foot">
            <span>{t('ventes.compte', { n: String(list.rows.length), total: String(list.total) })}</span>
            {list.hasMore && <button className="btn btn-sm" disabled={list.loading} onClick={() => void list.more()}>{t('common.voirPlus')}</button>}
          </div>
        )}
      </section>

      {sel && (
        <TicketModal vente={sel} title={t('ventes.detail', { n: numeroVente(sel.numero) })} onClose={() => { setSel(null); setCancel(false); }}>
          {admin && sel.statut === 'validee' && <button className="btn btn-danger" onClick={() => setCancel(true)}><LuBan /> {t('ventes.annuler')}</button>}
        </TicketModal>
      )}
      {sel && cancel && (
        <Modal title={t('ventes.annulerTitre', { n: numeroVente(sel.numero) })} size="sm" onClose={() => setCancel(false)}
          footer={<><button className="btn" onClick={() => setCancel(false)}>{t('common.annuler')}</button><button className="btn btn-danger" onClick={doCancel} disabled={busy}>{t('ventes.confirmerAnnulation')}</button></>}>
          <p className="muted-p">{t('ventes.annulerMsg')}</p>
          <Field label={t('ventes.motif')}><input className="input" value={motif} onChange={e => setMotif(e.target.value)} autoFocus /></Field>
        </Modal>
      )}
    </>
  );
}
