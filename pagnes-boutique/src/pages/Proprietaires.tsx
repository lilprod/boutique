import React, { useState } from 'react';
import { LuCircleAlert, LuPackage, LuUserRound, LuWallet } from 'react-icons/lu';
import type { UniteVente } from '../types';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { Link } from '../router';
import { CountUp, Empty, Skeleton, SkeletonRows } from '../components/ui';
import { cls, fcfa, fmtDate, num } from '../lib/format';
import { useFetch } from '../lib/useFetch';

/** Réponse de GET /rapports/proprietaires : ventes validées de la période (net des remises) et stock actuel. */
interface Rapport {
  du: string; au: string; unite_stock: UniteVente; total_ca: number;
  proprietaires: {
    id: number | null; nom: string; actif: boolean;
    ventes: { tickets: number; ca: number; cout: number; marge: number; quantite: number };
    stock: { coloris: number; quantite: number; ruptures: number; valeur: number };
  }[];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const debutMois = (decalage = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + decalage, 1); };
const finMois = (decalage = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + decalage + 1, 0); };

export default function Proprietaires() {
  const { db } = useApp();
  const [du, setDu] = useState(iso(debutMois()));
  const [au, setAu] = useState(iso(new Date()));
  const r = useFetch<Rapport>(`/rapports/proprietaires?du=${du}&au=${au}`);
  const d = r.data;
  const u = d?.unite_stock ?? db.parametres.uniteStock;

  const periode = (decalage: number) => { setDu(iso(debutMois(decalage))); setAu(iso(decalage === 0 ? new Date() : finMois(decalage))); };

  if (!db.parametres.multiProprietaires) {
    return (
      <>
        <div className="page-head"><div><h1>{t('prop.titre')}</h1><p className="muted-p">{t('prop.sousTitre')}</p></div></div>
        <div className="panel"><Empty title={t('prop.desactive')}><Link to="/parametres" className="btn btn-sm btn-primary">{t('prop.activer')}</Link></Empty></div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>{t('prop.titre')}</h1><p className="muted-p">{t('prop.sousTitre')}</p></div>
        <div className="page-actions period">
          <button className="btn btn-sm" onClick={() => periode(0)}>Ce mois</button>
          <button className="btn btn-sm" onClick={() => periode(-1)}>Mois dernier</button>
          <label className="field inline"><span className="field-label">{t('prop.du')}</span><input className="input" type="date" value={du} max={au} onChange={e => e.target.value && setDu(e.target.value)} /></label>
          <label className="field inline"><span className="field-label">{t('prop.au')}</span><input className="input" type="date" value={au} min={du} onChange={e => e.target.value && setAu(e.target.value)} /></label>
        </div>
      </div>

      {r.error && (
        <div className="panel state-box" role="alert">
          <span className="state-icon bad"><LuCircleAlert /></span>
          <div className="grow"><p className="muted-p">{r.error}</p></div>
          <button className="btn btn-sm" onClick={() => void r.reload()}>{t('common.reessayer')}</button>
        </div>
      )}

      <section className="panel kpis" aria-busy={r.loading}>
        <div>
          <span className="kpi-l">{t('prop.total')}</span>
          <span className="kpi-v">{d ? <CountUp value={d.total_ca} format={fcfa} /> : <Skeleton w={160} h={26} />}</span>
          {d && <span className="muted-s">{fmtDate(d.du)} → {fmtDate(d.au)}</span>}
        </div>
      </section>

      {!d && r.loading && <section className="panel"><SkeletonRows label={t('app.chargement')} /></section>}
      {d && d.proprietaires.length === 0 && <div className="panel"><Empty title={t('prop.aucun')}><Link to="/parametres" className="btn btn-sm">{t('prop.ajouter')}</Link></Empty></div>}

      {d && d.proprietaires.length > 0 && (
        <>
          <div className="owner-grid">
            {d.proprietaires.map((p, i) => {
              const part = d.total_ca > 0 ? Math.round((p.ventes.ca / d.total_ca) * 100) : 0;
              return (
                <article key={p.id ?? 'na'} className={cls('owner-card', p.id === null && 'na', !p.actif && 'off')} style={{ ['--i' as string]: i } as React.CSSProperties}>
                  <header><span className="owner-ico" aria-hidden="true"><LuUserRound /></span><h2>{p.id === null ? t('prop.nonAttribue') : p.nom}</h2>{!p.actif && <span className="badge mute">{t('prop.inactif')}</span>}</header>
                  <div className="owner-main">
                    <span className="stat-l"><LuWallet /> {t('prop.encaisse')}</span>
                    <span className="owner-v"><CountUp value={p.ventes.ca} format={fcfa} /></span>
                    <div className="owner-bar" aria-label={`${part} %`}><span style={{ width: `${part}%` }} /></div>
                    <span className="muted-s">{t('prop.tickets', { n: String(p.ventes.tickets) })} · {part} % du total</span>
                  </div>
                  <dl className="owner-facts">
                    <div><dt>{t('prop.marge')}</dt><dd className={p.ventes.marge >= 0 ? 'green' : 'red'}>{fcfa(p.ventes.marge)}</dd></div>
                    <div><dt>{t('prop.vendu')}</dt><dd>{num(p.ventes.quantite)} {uniteLabel(u, p.ventes.quantite)}</dd></div>
                    <div><dt><LuPackage /> {t('prop.enStock')}</dt><dd>{num(p.stock.quantite)} {uniteLabel(u, p.stock.quantite)}<small> · {t('prop.coloris', { n: String(p.stock.coloris) })}</small></dd></div>
                    <div><dt>{t('prop.valeurStock')}</dt><dd>{fcfa(p.stock.valeur)}</dd></div>
                  </dl>
                  {p.stock.ruptures > 0 && <span className="badge bad">{t('prop.ruptures', { n: String(p.stock.ruptures) })}</span>}
                </article>
              );
            })}
          </div>

          <section className="panel">
            <div className="panel-head"><div><h2>{t('prop.encaisse')}</h2><p className="panel-sub">{t('prop.encaisseHint')}</p></div></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>{t('prop.proprietaire')}</th><th className="r">{t('prop.encaisse')}</th><th className="r">{t('prop.marge')}</th><th className="r">{t('prop.vendu')}</th><th className="r">{t('prop.enStock')}</th><th className="r">{t('prop.valeurStock')}</th></tr></thead>
                <tbody>
                  {d.proprietaires.map(p => (
                    <tr key={p.id ?? 'na'}>
                      <td className="strong">{p.id === null ? t('prop.nonAttribue') : p.nom}</td>
                      <td className="r strong nowrap">{fcfa(p.ventes.ca)}</td>
                      <td className="r nowrap">{fcfa(p.ventes.marge)}</td>
                      <td className="r nowrap">{num(p.ventes.quantite)} {uniteLabel(u, p.ventes.quantite)}</td>
                      <td className="r nowrap">{num(p.stock.quantite)} {uniteLabel(u, p.stock.quantite)}</td>
                      <td className="r nowrap">{fcfa(p.stock.valeur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td className="strong">Total</td><td className="r strong nowrap">{fcfa(d.total_ca)}</td><td colSpan={4} /></tr></tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
