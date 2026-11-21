import React, { useState } from 'react';
import { LuCircleAlert, LuDownload, LuFileSpreadsheet } from 'react-icons/lu';
import { getBlob } from '../api';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { CountUp, Empty, Skeleton, useUI } from '../components/ui';
import { BarList, LineChart } from '../components/Charts';
import { useFetch } from '../lib/useFetch';
import { fcfa, fmtDayShort, num } from '../lib/format';
import type { UniteVente } from '../types';

interface Rapport {
  du: string; au: string; unite_stock: UniteVente;
  totaux: { ventes: number; ca: number; marge: number; panier_moyen: number; remises: number; remise_points: number; annulees: number; hors_ligne: number; anomalies: number };
  par_jour: { date: string; ventes: number; ca: number; marge: number }[];
  par_paiement: { mode: string; ventes: number; ca: number }[];
  par_vendeur: { vendeur_id: number; nom: string; ventes: number; ca: number; marge: number }[];
  par_produit: { produit_id: number; libelle: string; ventes: number; quantite: number; ca: number; marge: number }[];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jour = (decalage: number) => { const d = new Date(); d.setDate(d.getDate() + decalage); return d; };
const debutMois = (decalage = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + decalage, 1); };
const finMois = (decalage = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + decalage + 1, 0); };

/** Rapports de la boutique sur une période, et exports CSV (administrateur). */
export default function Rapports() {
  const { db } = useApp();
  const { toast } = useUI();
  const [du, setDu] = useState(iso(debutMois()));
  const [au, setAu] = useState(iso(new Date()));
  const r = useFetch<Rapport>(`/rapports/ventes?du=${du}&au=${au}`);
  const d = r.data;
  const u = d?.unite_stock ?? db.parametres.uniteStock;
  const [export_, setExport] = useState<string | null>(null);

  const periode = (debut: Date, fin: Date) => { setDu(iso(debut)); setAu(iso(fin)); };

  /** Télécharge un export CSV (jeton dans l'en-tête : un simple lien ne suffirait pas). */
  const telecharger = async (quoi: string, periodique = true) => {
    setExport(quoi);
    try {
      const blob = await getBlob(`/exports/${quoi}.csv${periodique ? `?du=${du}&au=${au}` : ''}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = periodique ? `${quoi}-${du}-${au}.csv` : `${quoi}-${iso(new Date())}.csv`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast(e?.message ?? t('rap.erreurExport'), 'err');
    } finally {
      setExport(null);
    }
  };

  const exports: { quoi: string; label: string; aide: string; periodique: boolean; visible: boolean }[] = [
    { quoi: 'ventes', label: t('rap.exVentes'), aide: t('rap.exVentesAide'), periodique: true, visible: true },
    { quoi: 'lignes', label: t('rap.exLignes'), aide: t('rap.exLignesAide'), periodique: true, visible: true },
    { quoi: 'mouvements', label: t('rap.exMouvements'), aide: t('rap.exMouvementsAide'), periodique: true, visible: true },
    { quoi: 'stock', label: t('rap.exStock'), aide: t('rap.exStockAide'), periodique: false, visible: true },
    { quoi: 'proprietaires', label: t('rap.exProprietaires'), aide: t('rap.exProprietairesAide'), periodique: true, visible: db.parametres.multiProprietaires },
  ];

  return (
    <>
      <div className="page-head">
        <div><h1>{t('rap.titre')}</h1><p className="muted-p">{t('rap.sousTitre')}</p></div>
        <div className="page-actions period">
          <button className="btn btn-sm" type="button" onClick={() => periode(jour(-6), new Date())}>{t('rap.septJours')}</button>
          <button className="btn btn-sm" type="button" onClick={() => periode(debutMois(), new Date())}>{t('rap.ceMois')}</button>
          <button className="btn btn-sm" type="button" onClick={() => periode(debutMois(-1), finMois(-1))}>{t('rap.moisDernier')}</button>
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

      <section className="panel kpis kpis-rap" aria-label={t('rap.indicateurs')} aria-busy={r.loading}>
        <div><span className="kpi-l">{t('rap.ca')}</span><span className="kpi-v">{d ? <CountUp value={d.totaux.ca} format={fcfa} /> : <Skeleton w={140} h={26} />}</span></div>
        <div><span className="kpi-l">{t('rap.ventes')}</span><span className="kpi-v">{d ? <CountUp value={d.totaux.ventes} /> : <Skeleton w={56} h={26} />}</span>
          {d && d.totaux.annulees > 0 && <span className="muted-s">{t('rap.annulees', { n: String(d.totaux.annulees) })}</span>}</div>
        <div><span className="kpi-l">{t('rap.panierMoyen')}</span><span className="kpi-v">{d ? <CountUp value={d.totaux.panier_moyen} format={fcfa} /> : <Skeleton w={120} h={26} />}</span></div>
        <div><span className="kpi-l">{t('rap.marge')}</span><span className="kpi-v green">{d ? <CountUp value={d.totaux.marge} format={fcfa} /> : <Skeleton w={120} h={26} />}</span>
          {d && d.totaux.ca > 0 && <span className="muted-s">{t('rap.tauxMarge', { n: String(Math.round((d.totaux.marge / d.totaux.ca) * 100)) })}</span>}</div>
        <div><span className="kpi-l">{t('rap.remises')}</span><span className="kpi-v">{d ? <CountUp value={d.totaux.remises} format={fcfa} /> : <Skeleton w={120} h={26} />}</span>
          {d && d.totaux.remise_points > 0 && <span className="muted-s">{t('rap.dontPoints', { m: fcfa(d.totaux.remise_points) })}</span>}</div>
      </section>
      {d && d.totaux.anomalies > 0 && <p className="hint rap-hint">{t('rap.horsLigne', { n: String(d.totaux.hors_ligne), a: String(d.totaux.anomalies) })}</p>}

      {d && d.totaux.ventes === 0 ? <div className="panel"><Empty title={t('rap.aucuneVente')} /></div> : d && (
        <>
          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><h2>{t('rap.parJour')}</h2></div>
              {d.par_jour.length > 1
                ? <LineChart data={d.par_jour.map(x => ({ label: fmtDayShort(x.date), value: x.ca }))} ariaLabel={t('rap.parJour')} />
                : <p className="muted-p">{t('rap.unSeulJour', { m: fcfa(d.par_jour[0]?.ca ?? 0) })}</p>}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>{t('rap.parPaiement')}</h2></div>
              <BarList items={d.par_paiement.map(p => ({ label: t('pay.' + p.mode), value: p.ca, sub: t('rap.nVentes', { n: String(p.ventes) }) }))} format={fcfa} />
            </section>
          </div>

          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><h2>{t('rap.parVendeur')}</h2></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>{t('ventes.vendeur')}</th><th className="r">{t('rap.ventes')}</th><th className="r">{t('rap.ca')}</th><th className="r">{t('rap.marge')}</th></tr></thead>
                  <tbody>{d.par_vendeur.map(v => <tr key={v.vendeur_id}><td className="strong">{v.nom}</td><td className="r">{v.ventes}</td><td className="r">{fcfa(v.ca)}</td><td className="r green">{fcfa(v.marge)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>{t('rap.parProduit')}</h2><span className="muted-s">{t('rap.netEncaisse')}</span></div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>{t('rap.produit')}</th><th className="r">{t('rap.quantite', { unite: uniteLabel(u, 2) })}</th><th className="r">{t('rap.ca')}</th><th className="r">{t('rap.marge')}</th></tr></thead>
                  <tbody>{d.par_produit.map(p => <tr key={p.produit_id}><td className="strong">{p.libelle}</td><td className="r">{num(p.quantite)}</td><td className="r">{fcfa(p.ca)}</td><td className="r green">{fcfa(p.marge)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>{t('rap.exports')}</h2><p className="panel-sub">{t('rap.exportsSous')}</p></div></div>
        <ul className="export-list">
          {exports.filter(e => e.visible).map(e => (
            <li key={e.quoi}>
              <LuFileSpreadsheet aria-hidden="true" />
              <div className="grow"><strong>{e.label}</strong><div className="muted-s">{e.aide}{e.periodique ? '' : ` ${t('rap.aujourdhui')}`}</div></div>
              <button className="btn btn-sm" type="button" disabled={export_ !== null} onClick={() => void telecharger(e.quoi, e.periodique)}>
                <LuDownload /> {export_ === e.quoi ? t('app.chargement') : t('rap.telecharger')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
