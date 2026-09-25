import React, { useMemo, useState } from 'react';
import { useApp } from '../store';
import { t } from '../i18n';
import { Link } from '../router';
import { Badge, Segmented, Swatch } from '../components/ui';
import { BarList, LineChart } from '../components/Charts';
import { dayKey, fcfa, fmtDateTime, fmtDayShort, num, numeroVente, sum } from '../lib/format';
import { statutStock } from '../lib/calc';

export default function Dashboard() {
  const { db, user } = useApp();
  const admin = user!.role === 'admin';
  const [range, setRange] = useState<'7' | '30'>('7');

  const d = useMemo(() => {
    const mine = db.ventes.filter(v => v.statut === 'validee' && (admin || v.vendeurId === user!.id));
    const today = dayKey(new Date());
    const jour = mine.filter(v => dayKey(v.date) === today);
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); days.push(dayKey(x)); }
    const byDay = new Map<string, number>();
    mine.forEach(v => byDay.set(dayKey(v.date), (byDay.get(dayKey(v.date)) || 0) + v.total));
    const last30 = new Set(days);
    const recent = mine.filter(v => last30.has(dayKey(v.date)));
    const prod = new Map<string, { label: string; value: number; yards: number }>();
    recent.forEach(v => v.lignes.forEach(l => {
      const c = prod.get(l.produitId) ?? { label: l.libelle, value: 0, yards: 0 };
      c.value += l.total; c.yards += l.yards; prod.set(l.produitId, c);
    }));
    const vend = new Map<string, number>();
    recent.forEach(v => vend.set(v.vendeurId, (vend.get(v.vendeurId) || 0) + v.total));
    return {
      today, jour, days, byDay,
      ca: sum(jour.map(v => v.total)), marge: sum(jour.map(v => v.marge)),
      top: [...prod.values()].sort((a, b) => b.value - a.value).slice(0, 6),
      vendeurs: [...vend.entries()].map(([id, value]) => ({ label: db.users.find(u => u.id === id)?.nom ?? id, value })).sort((a, b) => b.value - a.value),
      dernieres: [...db.ventes].filter(v => admin || v.vendeurId === user!.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7),
      caPeriode: sum(recent.map(v => v.total)),
    };
  }, [db, admin, user]);

  const alertes = db.variantes.filter(v => statutStock(v) !== 'ok').sort((a, b) => a.stock / (a.seuil || 1) - b.stock / (b.seuil || 1));
  const serie = d.days.slice(range === '7' ? -7 : -30).map(k => ({ label: fmtDayShort(k), value: d.byDay.get(k) || 0 }));
  const prodOf = (id: string) => db.produits.find(p => p.id === id);

  return (
    <>
      <div className="page-head">
        <div><h1>{t('dash.titre')}</h1><p className="muted-p">{admin ? t('dash.sousTitreAdmin') : t('dash.sousTitreVendeur')}</p></div>
        <Link to="/caisse" className="btn btn-primary">{t('nav.caisse')}</Link>
      </div>

      <section className="panel kpis" aria-label={t('dash.indicateurs')}>
        <div><span className="kpi-l">{admin ? t('dash.ventesJour') : t('dash.mesVentesJour')}</span><span className="kpi-v">{d.jour.length}</span></div>
        <div><span className="kpi-l">{t('dash.caJour')}</span><span className="kpi-v">{fcfa(d.ca)}</span></div>
        {admin && <div><span className="kpi-l">{t('dash.margeJour')}</span><span className="kpi-v green">{fcfa(d.marge)}</span></div>}
        <div><span className="kpi-l">{t('dash.alertes')}</span><span className={'kpi-v ' + (alertes.length ? 'red' : '')}>{alertes.length}</span></div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('dash.courbe')}</h2>
            <Segmented label={t('dash.periode')} value={range} onChange={setRange} options={[{ v: '7', label: t('dash.7j') }, { v: '30', label: t('dash.30j') }]} />
          </div>
          <LineChart data={serie} ariaLabel={t('dash.courbe')} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>{t('dash.alertesStock')}</h2><Link to="/stock" className="link">{t('dash.voirStock')}</Link></div>
          {alertes.length === 0 ? <p className="muted-p">{t('dash.aucuneAlerte')}</p> : (
            <ul className="alert-list">
              {alertes.slice(0, 6).map(v => {
                const p = prodOf(v.produitId)!;
                return (
                  <li key={v.id}>
                    <Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={34} />
                    <div className="grow"><div className="strong">{p.nom}</div><div className="muted-s">{v.coloris}</div></div>
                    <div className="right"><div>{num(v.stock)} yd</div><Badge kind={v.stock <= 0 ? 'bad' : 'warn'}>{v.stock <= 0 ? t('stock.rupture') : t('stock.bas')}</Badge></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className={admin ? 'grid-2' : ''}>
        <section className="panel">
          <div className="panel-head"><h2>{t('dash.topProduits')}</h2><span className="muted-s">{t('dash.30jours')}</span></div>
          {d.top.length === 0 ? <p className="muted-p">{t('common.aucunResultat')}</p> : <BarList items={d.top.map(x => ({ label: x.label, value: x.value, sub: t('dash.yardsVendus', { n: num(x.yards) }) }))} format={fcfa} color="var(--orange)" />}
        </section>
        {admin && (
          <section className="panel">
            <div className="panel-head"><h2>{t('dash.parVendeur')}</h2><span className="muted-s">{t('dash.30jours')}</span></div>
            {d.vendeurs.length === 0 ? <p className="muted-p">{t('common.aucunResultat')}</p> : <BarList items={d.vendeurs} format={fcfa} color="var(--indigo-2)" />}
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>{t('dash.dernieres')}</h2><Link to="/ventes" className="link">{t('dash.toutesVentes')}</Link></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('ventes.numero')}</th><th>{t('ventes.date')}</th><th>{t('ventes.vendeur')}</th><th>{t('ventes.client')}</th><th>{t('ventes.paiement')}</th><th className="r">{t('ventes.total')}</th></tr></thead>
            <tbody>
              {d.dernieres.map(v => (
                <tr key={v.id} className={v.statut === 'annulee' ? 'struck' : ''}>
                  <td>{numeroVente(v.numero)}</td><td>{fmtDateTime(v.date)}</td>
                  <td>{db.users.find(u => u.id === v.vendeurId)?.nom}</td>
                  <td>{db.clients.find(c => c.id === v.clientId)?.nom ?? '—'}</td>
                  <td>{t('pay.' + v.paiement.mode)}</td>
                  <td className="r">{v.statut === 'annulee' ? <Badge kind="mute">{t('ventes.annulee')}</Badge> : fcfa(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
