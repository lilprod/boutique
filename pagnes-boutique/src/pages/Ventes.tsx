import React, { useMemo, useState } from 'react';
import { LuBan, LuSearch } from 'react-icons/lu';
import { useApp } from '../store';
import { t } from '../i18n';
import { Badge, Empty, Field, Modal, useUI } from '../components/ui';
import { TicketModal } from '../components/TicketModal';
import { fcfa, fmtDateTime, norm, numeroVente } from '../lib/format';

export default function Ventes() {
  const { db, user, annulerVente } = useApp();
  const { toast } = useUI();
  const admin = user!.role === 'admin';
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [motif, setMotif] = useState('');
  const [limit, setLimit] = useState(50);

  const list = useMemo(() => db.ventes
    .filter(v => (admin || v.vendeurId === user!.id) && (!statut || v.statut === statut))
    .filter(v => {
      if (!q) return true;
      const hay = [numeroVente(v.numero), db.clients.find(c => c.id === v.clientId)?.nom, db.users.find(u => u.id === v.vendeurId)?.nom, ...v.lignes.map(l => l.libelle), v.paiement.reference].join(' ');
      return norm(hay).includes(norm(q));
    })
    .sort((a, b) => b.date.localeCompare(a.date)), [db, q, statut, admin, user]);

  const vente = db.ventes.find(v => v.id === sel);
  const doCancel = () => {
    const r = annulerVente(sel!, motif);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('ventes.annuleeOk')); setCancel(false); setMotif('');
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
        </div>
        <div className="table-wrap">
          <table className="tbl clickable">
            <thead><tr><th>{t('ventes.numero')}</th><th>{t('ventes.date')}</th><th>{t('ventes.vendeur')}</th><th>{t('ventes.client')}</th><th className="r">{t('ventes.articles')}</th><th>{t('ventes.paiement')}</th><th className="r">{t('ventes.total')}</th><th>{t('stock.statut')}</th></tr></thead>
            <tbody>
              {list.slice(0, limit).map(v => (
                <tr key={v.id} className={v.statut === 'annulee' ? 'struck' : ''} onClick={() => setSel(v.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSel(v.id); }}>
                  <td className="strong">{numeroVente(v.numero)}</td><td>{fmtDateTime(v.date)}</td>
                  <td>{db.users.find(u => u.id === v.vendeurId)?.nom}</td><td>{db.clients.find(c => c.id === v.clientId)?.nom ?? '—'}</td>
                  <td className="r">{v.lignes.length}</td><td>{t('pay.' + v.paiement.mode)}</td><td className="r strong">{fcfa(v.total)}</td>
                  <td><Badge kind={v.statut === 'validee' ? 'ok' : 'mute'}>{t('ventes.' + v.statut)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <Empty title={t('common.aucunResultat')} />}
        </div>
        {list.length > limit && <div className="table-foot"><button className="btn btn-sm" onClick={() => setLimit(l => l + 50)}>{t('common.voirPlus')}</button></div>}
      </section>

      {vente && (
        <TicketModal vente={vente} title={t('ventes.detail', { n: numeroVente(vente.numero) })} onClose={() => { setSel(null); setCancel(false); }}>
          {admin && vente.statut === 'validee' && <button className="btn btn-danger" onClick={() => setCancel(true)}><LuBan /> {t('ventes.annuler')}</button>}
        </TicketModal>
      )}
      {vente && cancel && (
        <Modal title={t('ventes.annulerTitre', { n: numeroVente(vente.numero) })} size="sm" onClose={() => setCancel(false)}
          footer={<><button className="btn" onClick={() => setCancel(false)}>{t('common.annuler')}</button><button className="btn btn-danger" onClick={doCancel}>{t('ventes.confirmerAnnulation')}</button></>}>
          <p className="muted-p">{t('ventes.annulerMsg')}</p>
          <Field label={t('ventes.motif')}><input className="input" value={motif} onChange={e => setMotif(e.target.value)} autoFocus /></Field>
        </Modal>
      )}
    </>
  );
}
