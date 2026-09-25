import React, { useState } from 'react';
import type { ModePaiement } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Link } from '../router';
import { Badge, Segmented, Swatch } from '../components/ui';
import { BarList, LineChart } from '../components/Charts';
import { fcfa, fmtDateTime, fmtDayShort, num, numeroVente } from '../lib/format';
import { statutStock } from '../lib/calc';
import { useFetch } from '../lib/useFetch';

/** Réponse de GET /tableau-de-bord : agrégats calculés par le serveur (30 derniers jours). Marge et `par_vendeur` : administrateur seulement. */
interface Stats {
  jour: { ventes: number; ca: number; marge?: number };
  serie: { date: string; ventes: number; ca: number }[];
  top_produits: { produit_id: number; libelle: string; total: number; yards: number }[];
  par_vendeur?: { vendeur_id: number; nom: string; total: number }[];
  dernieres: { id: number; numero: number; created_at: string; paiement_mode: ModePaiement; statut: 'validee' | 'annulee'; total: number; vendeur?: { nom: string }; client?: { nom: string } | null }[];
}

export default function Dashboard() {
  const { db, user } = useApp();
  const admin = user!.role === 'admin';
  const [range, setRange] = useState<'7' | '30'>('7');
  const stats = useFetch<Stats>('/tableau-de-bord');
  const s = stats.data;

  const alertes = db.variantes.filter(v => statutStock(v) !== 'ok').sort((a, b) => a.stock / (a.seuil || 1) - b.stock / (b.seuil || 1));
  const serie = (s?.serie ?? []).slice(range === '7' ? -7 : -30).map(x => ({ label: fmtDayShort(x.date), value: x.ca }));
  const prodOf = (id: string) => db.produits.find(p => p.id === id);

  return (
    <>
      <div className="page-head">
        <div><h1>{t('dash.titre')}</h1><p className="muted-p">{admin ? t('dash.sousTitreAdmin') : t('dash.sousTitreVendeur')}</p></div>
        <Link to="/caisse" className="btn btn-primary">{t('nav.caisse')}</Link>
      </div>

      {stats.error && (
        <div className="panel pad" role="alert"><p className="error">{stats.error}</p><button className="btn btn-sm" onClick={() => void stats.reload()}>{t('common.reessayer')}</button></div>
      )}

      <section className="panel kpis" aria-label={t('dash.indicateurs')} aria-busy={stats.loading}>
        <div><span className="kpi-l">{admin ? t('dash.ventesJour') : t('dash.mesVentesJour')}</span><span className="kpi-v">{s ? s.jour.ventes : '—'}</span></div>
        <div><span className="kpi-l">{t('dash.caJour')}</span><span className="kpi-v">{s ? fcfa(s.jour.ca) : '—'}</span></div>
        {admin && <div><span className="kpi-l">{t('dash.margeJour')}</span><span className="kpi-v green">{s ? fcfa(s.jour.marge ?? 0) : '—'}</span></div>}
        <div><span className="kpi-l">{t('dash.alertes')}</span><span className={'kpi-v ' + (alertes.length ? 'red' : '')}>{alertes.length}</span></div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('dash.courbe')}</h2>
            <Segmented label={t('dash.periode')} value={range} onChange={setRange} options={[{ v: '7', label: t('dash.7j') }, { v: '30', label: t('dash.30j') }]} />
          </div>
          {s ? <LineChart data={serie} ariaLabel={t('dash.courbe')} /> : <p className="muted-p" role="status">{stats.loading ? t('app.chargement') : '—'}</p>}
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

      {s && (
        <>
          <div className={admin ? 'grid-2' : ''}>
            <section className="panel">
              <div className="panel-head"><h2>{t('dash.topProduits')}</h2><span className="muted-s">{t('dash.30jours')}</span></div>
              {s.top_produits.length === 0 ? <p className="muted-p">{t('common.aucunResultat')}</p> : <BarList items={s.top_produits.map(x => ({ label: x.libelle, value: x.total, sub: t('dash.yardsVendus', { n: num(x.yards) }) }))} format={fcfa} color="var(--orange)" />}
            </section>
            {admin && (
              <section className="panel">
                <div className="panel-head"><h2>{t('dash.parVendeur')}</h2><span className="muted-s">{t('dash.30jours')}</span></div>
                {!s.par_vendeur?.length ? <p className="muted-p">{t('common.aucunResultat')}</p> : <BarList items={s.par_vendeur.map(x => ({ label: x.nom, value: x.total }))} format={fcfa} color="var(--indigo-2)" />}
              </section>
            )}
          </div>

          <section className="panel">
            <div className="panel-head"><h2>{t('dash.dernieres')}</h2><Link to="/ventes" className="link">{t('dash.toutesVentes')}</Link></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>{t('ventes.numero')}</th><th>{t('ventes.date')}</th><th>{t('ventes.vendeur')}</th><th>{t('ventes.client')}</th><th>{t('ventes.paiement')}</th><th className="r">{t('ventes.total')}</th></tr></thead>
                <tbody>
                  {s.dernieres.map(v => (
                    <tr key={v.id} className={v.statut === 'annulee' ? 'struck' : ''}>
                      <td>{numeroVente(v.numero)}</td><td>{fmtDateTime(v.created_at)}</td>
                      <td>{v.vendeur?.nom}</td>
                      <td>{v.client?.nom ?? '—'}</td>
                      <td>{t('pay.' + v.paiement_mode)}</td>
                      <td className="r">{v.statut === 'annulee' ? <Badge kind="mute">{t('ventes.annulee')}</Badge> : fcfa(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
