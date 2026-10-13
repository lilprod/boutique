import React, { useMemo, useState } from 'react';
import { LuGift, LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';
import type { Client } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Badge, Empty, Modal, SkeletonRows, useUI } from '../components/ui';
import { ClientForm } from '../components/ClientForm';
import { toMouvementPoints } from '../lib/mappers';
import { useFetch } from '../lib/useFetch';
import { cls, fcfa, fmtDate, fmtDateTime, norm, num } from '../lib/format';

export default function Clients() {
  const { db, user, shopMode, deleteClient } = useApp();
  const { toast, confirm } = useUI();
  const admin = user!.role === 'admin' || user!.role === 'boutique_admin' || (user!.role === 'tenant_admin' && shopMode);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Client | 'new' | null>(null);
  const [pointsDe, setPointsDe] = useState<Client | null>(null);
  const fidelite = db.parametres.fideliteActive;

  const rows = useMemo(() => db.clients
    .filter(c => !q || norm([c.nom, c.telephone, c.adresse].join(' ')).includes(norm(q)))
    // Nombre d'achats, montant dépensé et dernier achat : calculés par l'API sur les ventes validées.
    .map(c => ({ c, n: c.achats ?? 0, total: c.depense ?? 0, last: c.derniereVente }))
    .sort((a, b) => a.c.nom.localeCompare(b.c.nom, 'fr')), [db.clients, q]);

  const remove = async (c: Client) => {
    if (!(await confirm({ title: t('clients.supprimerTitre'), message: t('clients.supprimerMsg', { nom: c.nom }), confirmLabel: t('common.supprimer'), danger: true }))) return;
    const r = await deleteClient(c.id);
    r.ok ? toast(t('clients.supprime')) : toast(r.error!, 'err');
  };

  return (
    <>
      <div className="page-head">
        <div><h1>{t('clients.titre')}</h1><p className="muted-p">{t('clients.sousTitre')}</p></div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><LuPlus /> {t('clients.nouveau')}</button>
      </div>
      <section className="panel">
        <div className="filters"><div className="search"><LuSearch /><input className="input" placeholder={t('clients.rechercher')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('clients.rechercher')} /></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('clients.nom')}</th><th>{t('clients.telephone')}</th><th>{t('clients.adresse')}</th><th className="r">{t('clients.achats')}</th><th className="r">{t('clients.depense')}</th><th>{t('clients.dernier')}</th>{fidelite && <th className="r">{t('fid.colonne')}</th>}<th className="r">{t('common.actions')}</th></tr></thead>
            <tbody>
              {rows.map(({ c, n, total, last }) => (
                <tr key={c.id}>
                  <td className="strong">{c.nom}</td><td>{c.telephone || '—'}</td><td>{c.adresse || '—'}</td>
                  <td className="r">{n}</td><td className="r">{fcfa(total)}</td><td>{last ? fmtDate(last) : '—'}</td>
                  {fidelite && (
                    <td className="r">
                      <button className={cls('link points-link', c.points < 0 && 'red')} onClick={() => setPointsDe(c)} title={t('fid.historique')}><LuGift /> {num(c.points)}</button>
                    </td>
                  )}
                  <td className="r nowrap">
                    <button className="icon-btn" title={t('common.modifier')} aria-label={t('common.modifier')} onClick={() => setEdit(c)}><LuPencil /></button>
                    {admin && <button className="icon-btn danger" title={t('common.supprimer')} aria-label={t('common.supprimer')} onClick={() => remove(c)}><LuTrash2 /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty title={t('common.aucunResultat')} />}
        </div>
        <div className="table-foot">{t('clients.compte', { n: String(rows.length) })}</div>
      </section>
      {edit && <ClientForm client={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {pointsDe && <PointsModal client={db.clients.find(x => x.id === pointsDe.id) ?? pointsDe} admin={admin} onClose={() => setPointsDe(null)} />}
    </>
  );
}

/** Solde, historique des points et, pour l'administrateur, ajout ou retrait manuel avec motif. */
function PointsModal({ client, admin, onClose }: { client: Client; admin: boolean; onClose: () => void }) {
  const { ajusterPoints } = useApp();
  const { toast } = useUI();
  const h = useFetch<{ solde: number; mouvements: any[] }>(`/clients/${client.id}/points`);
  const mouvements = (h.data?.mouvements ?? []).map(toMouvementPoints);
  const [points, setPoints] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await ajusterPoints(client.id, Number(points), motif);
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('fid.ajusteOk')); setPoints(''); setMotif(''); void h.reload();
  };

  return (
    <Modal title={`${t('fid.historique')} · ${client.nom}`} onClose={onClose}>
      <div className="fid-box"><div className="fid-solde"><LuGift /><strong className={cls(client.points < 0 && 'red')}>{t('fid.solde', { n: num(client.points) })}</strong></div></div>
      {client.points < 0 && <p className="hint">{t('fid.negatif')}</p>}
      {admin && (
        <form className="fid-ajust" onSubmit={submit}>
          <span className="field-label">{t('fid.ajuster')}</span>
          <div className="row-2">
            <input className="input num" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value.replace(/[^\d-]/g, ''))} placeholder={t('fid.points')} aria-label={t('fid.points')} required />
            <input className="input" value={motif} onChange={e => setMotif(e.target.value)} placeholder={t('fid.motifEx')} aria-label={t('fid.motif')} maxLength={190} required />
          </div>
          <div><button className="btn btn-sm btn-primary" type="submit" disabled={busy}>{t('common.enregistrer')}</button></div>
        </form>
      )}
      {h.loading && !h.data ? <SkeletonRows rows={3} label={t('app.chargement')} /> : mouvements.length === 0 ? <Empty title={t('fid.aucunMouvement')} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('ventes.date')}</th><th>{t('stock.typeMouvement')}</th><th className="r">{t('fid.colonne')}</th><th>{t('stock.detail')}</th></tr></thead>
            <tbody>
              {mouvements.map(m => (
                <tr key={m.id}>
                  <td className="nowrap">{fmtDateTime(m.date)}</td>
                  <td><Badge kind={m.points > 0 ? 'ok' : m.type === 'expiration' ? 'mute' : 'warn'}>{t('fid.t.' + m.type)}</Badge></td>
                  <td className={cls('r strong', m.points < 0 ? 'red' : 'green')}>{m.points > 0 ? '+' : ''}{num(m.points)}</td>
                  <td className="muted-s">{m.motif}{m.userNom ? ` · ${m.userNom}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
