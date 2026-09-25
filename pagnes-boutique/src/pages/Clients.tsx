import React, { useMemo, useState } from 'react';
import { LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';
import type { Client } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Empty, useUI } from '../components/ui';
import { ClientForm } from '../components/ClientForm';
import { fcfa, fmtDate, norm, sum } from '../lib/format';

export default function Clients() {
  const { db, user, deleteClient } = useApp();
  const { toast, confirm } = useUI();
  const admin = user!.role === 'admin';
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Client | 'new' | null>(null);

  const rows = useMemo(() => db.clients
    .filter(c => !q || norm([c.nom, c.telephone, c.adresse].join(' ')).includes(norm(q)))
    .map(c => {
      const vs = db.ventes.filter(v => v.clientId === c.id && v.statut === 'validee');
      return { c, n: vs.length, total: sum(vs.map(v => v.total)), last: vs.map(v => v.date).sort().pop() };
    }).sort((a, b) => a.c.nom.localeCompare(b.c.nom, 'fr')), [db.clients, db.ventes, q]);

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
            <thead><tr><th>{t('clients.nom')}</th><th>{t('clients.telephone')}</th><th>{t('clients.adresse')}</th><th className="r">{t('clients.achats')}</th><th className="r">{t('clients.depense')}</th><th>{t('clients.dernier')}</th><th className="r">{t('common.actions')}</th></tr></thead>
            <tbody>
              {rows.map(({ c, n, total, last }) => (
                <tr key={c.id}>
                  <td className="strong">{c.nom}</td><td>{c.telephone || '—'}</td><td>{c.adresse || '—'}</td>
                  <td className="r">{n}</td><td className="r">{fcfa(total)}</td><td>{last ? fmtDate(last) : '—'}</td>
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
    </>
  );
}
