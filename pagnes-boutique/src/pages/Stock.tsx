import React, { useMemo, useState } from 'react';
import { LuHistory, LuImagePlus, LuPackagePlus, LuPencil, LuPlus, LuSearch, LuSlidersHorizontal, LuTrash2, LuX } from 'react-icons/lu';
import type { Produit, UniteVente, Variante } from '../types';
import { useApp, type VarForm } from '../store';
import { t, uniteLabel } from '../i18n';
import { Badge, Empty, Field, fileToDataUrl, Modal, NumInput, Segmented, Swatch, useUI } from '../components/ui';
import { COLORIS, TYPES } from '../data/seed';
import { statutStock, yardsOf } from '../lib/calc';
import { fcfa, fmtDateTime, norm, num, r2, uid } from '../lib/format';

type ModalState = null | { kind: 'produit'; id?: string } | { kind: 'entree'; vid: string } | { kind: 'ajust'; vid: string };

export default function Stock() {
  const { db, user, deleteProduit } = useApp();
  const { toast, confirm } = useUI();
  const admin = user!.role === 'admin';
  const [tab, setTab] = useState<'articles' | 'mouvements'>('articles');
  const [f, setF] = useState({ q: '', type: '', motif: '', coloris: '', origine: '', statut: '' });
  const [mtype, setMtype] = useState('');
  const [histVid, setHistVid] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));

  const rows = useMemo(() => db.variantes.map(v => ({ v, p: db.produits.find(p => p.id === v.produitId)! })).filter(r => r.p)
    .sort((a, b) => a.p.nom.localeCompare(b.p.nom, 'fr') || a.v.coloris.localeCompare(b.v.coloris, 'fr')), [db.variantes, db.produits]);
  const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'fr'));
  const opts = { type: uniq(db.produits.map(p => p.type)), motif: uniq(db.produits.map(p => p.motif)), coloris: uniq(db.variantes.map(v => v.coloris)), origine: uniq(db.produits.map(p => p.origine)) };

  const filtered = rows.filter(({ v, p }) => {
    if (f.q && !norm([p.nom, v.coloris, v.sku, p.motif, p.origine, p.type].join(' ')).includes(norm(f.q))) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.motif && p.motif !== f.motif) return false;
    if (f.coloris && v.coloris !== f.coloris) return false;
    if (f.origine && p.origine !== f.origine) return false;
    if (f.statut && statutStock(v) !== f.statut) return false;
    return true;
  });

  const mv = useMemo(() => [...db.mouvements].filter(m => (!mtype || m.type === mtype) && (!histVid || m.varianteId === histVid)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300), [db.mouvements, mtype, histVid]);
  const label = (vid: string) => { const v = db.variantes.find(x => x.id === vid); const p = v && db.produits.find(x => x.id === v.produitId); return v && p ? `${p.nom} — ${v.coloris}` : '—'; };

  const remove = async (p: Produit) => {
    if (!(await confirm({ title: t('stock.supprimerTitre'), message: t('stock.supprimerMsg', { nom: p.nom }), confirmLabel: t('common.supprimer'), danger: true }))) return;
    const r = deleteProduit(p.id);
    r.ok ? toast(t('stock.supprime')) : toast(r.error!, 'err');
  };

  return (
    <>
      <div className="page-head">
        <div><h1>{t('stock.titre')}</h1><p className="muted-p">{admin ? t('stock.sousTitreAdmin') : t('stock.sousTitreVendeur')}</p></div>
        {admin && <button className="btn btn-primary" onClick={() => setModal({ kind: 'produit' })}><LuPlus /> {t('stock.nouveauProduit')}</button>}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'articles'} className={tab === 'articles' ? 'on' : ''} onClick={() => setTab('articles')}>{t('stock.articles')}</button>
        <button role="tab" aria-selected={tab === 'mouvements'} className={tab === 'mouvements' ? 'on' : ''} onClick={() => setTab('mouvements')}>{t('stock.mouvements')}</button>
      </div>

      {tab === 'articles' ? (
        <section className="panel">
          <div className="filters">
            <div className="search"><LuSearch /><input className="input" placeholder={t('stock.rechercher')} value={f.q} onChange={e => set('q', e.target.value)} aria-label={t('stock.rechercher')} /></div>
            <select className="select" value={f.type} onChange={e => set('type', e.target.value)} aria-label={t('stock.type')}><option value="">{t('stock.tousTypes')}</option>{opts.type.map(o => <option key={o}>{o}</option>)}</select>
            <select className="select" value={f.motif} onChange={e => set('motif', e.target.value)} aria-label={t('stock.motif')}><option value="">{t('stock.tousMotifs')}</option>{opts.motif.map(o => <option key={o}>{o}</option>)}</select>
            <select className="select" value={f.coloris} onChange={e => set('coloris', e.target.value)} aria-label={t('stock.coloris')}><option value="">{t('stock.tousColoris')}</option>{opts.coloris.map(o => <option key={o}>{o}</option>)}</select>
            <select className="select" value={f.origine} onChange={e => set('origine', e.target.value)} aria-label={t('stock.origine')}><option value="">{t('stock.toutesOrigines')}</option>{opts.origine.map(o => <option key={o}>{o}</option>)}</select>
            <select className="select" value={f.statut} onChange={e => set('statut', e.target.value)} aria-label={t('stock.statut')}>
              <option value="">{t('stock.tousStatuts')}</option><option value="ok">{t('stock.ok')}</option><option value="bas">{t('stock.bas')}</option><option value="rupture">{t('stock.rupture')}</option>
            </select>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th></th><th>{t('stock.article')}</th><th className="r">{t('stock.stock')}</th>
                <th className="r">{t('stock.prixVente')}</th><th>{t('stock.statut')}</th>{admin && <th className="r">{t('common.actions')}</th>}
              </tr></thead>
              <tbody>
                {filtered.map(({ v, p }) => {
                  const s = statutStock(v);
                  const marge = p.vendPagne && p.prixPagne > 0 ? Math.round(((p.prixPagne - p.prixAchatPagne) / p.prixPagne) * 100) : null;
                  return (
                    <tr key={v.id}>
                      <td><Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={38} /></td>
                      <td><div className="strong">{p.nom}</div><div>{v.coloris}</div><div className="muted-s">{p.type} · {p.motif} · {p.origine}</div></td>
                      <td className="r nowrap"><div className="strong">{num(v.stock)} yd</div><div className="muted-s">≈ {num(Math.round((v.stock / p.yardsParPagne) * 10) / 10)} {uniteLabel('pagne', 2)} · {t('stock.seuil').toLowerCase()} {num(v.seuil)}</div></td>
                      <td className="r nowrap">{p.vendPagne && <div>{fcfa(p.prixPagne)}<span className="muted-s"> / {t('unite.pagne')}</span></div>}{p.vendYard && <div className="muted-s">{fcfa(p.prixYard)} / {t('unite.yard')}</div>}{admin && <div className="muted-s">{t('stock.achat')} {fcfa(p.prixAchatPagne)}{marge !== null && ` · ${t('stock.marge', { n: String(marge) })}`}</div>}</td>
                      <td><Badge kind={s === 'ok' ? 'ok' : s === 'bas' ? 'warn' : 'bad'}>{t('stock.' + s)}</Badge></td>
                      {admin && (
                        <td className="r nowrap">
                          <button className="icon-btn" title={t('stock.entree')} aria-label={t('stock.entree')} onClick={() => setModal({ kind: 'entree', vid: v.id })}><LuPackagePlus /></button>
                          <button className="icon-btn" title={t('stock.ajuster')} aria-label={t('stock.ajuster')} onClick={() => setModal({ kind: 'ajust', vid: v.id })}><LuSlidersHorizontal /></button>
                          <button className="icon-btn" title={t('stock.historique')} aria-label={t('stock.historique')} onClick={() => { setHistVid(v.id); setTab('mouvements'); }}><LuHistory /></button>
                          <button className="icon-btn" title={t('common.modifier')} aria-label={t('common.modifier')} onClick={() => setModal({ kind: 'produit', id: p.id })}><LuPencil /></button>
                          <button className="icon-btn danger" title={t('common.supprimer')} aria-label={t('common.supprimer')} onClick={() => remove(p)}><LuTrash2 /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <Empty title={t('common.aucunResultat')} />}
          </div>
          <div className="table-foot">{t('stock.compte', { n: String(filtered.length) })}</div>
        </section>
      ) : (
        <section className="panel">
          <div className="filters">
            <select className="select" value={mtype} onChange={e => setMtype(e.target.value)} aria-label={t('stock.typeMouvement')}>
              <option value="">{t('stock.tousMouvements')}</option>
              {(['entree', 'vente', 'annulation', 'ajustement'] as const).map(x => <option key={x} value={x}>{t('mvt.' + x)}</option>)}
            </select>
            {histVid && <button className="chip" onClick={() => setHistVid(null)}>{label(histVid)} <LuX /></button>}
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('ventes.date')}</th><th>{t('stock.article')}</th><th>{t('stock.typeMouvement')}</th><th className="r">{t('stock.quantite')}</th><th>{t('stock.utilisateur')}</th><th>{t('stock.detail')}</th></tr></thead>
              <tbody>
                {mv.map(m => (
                  <tr key={m.id}>
                    <td>{fmtDateTime(m.date)}</td><td>{label(m.varianteId)}</td>
                    <td><Badge kind={m.type === 'entree' ? 'ok' : m.type === 'vente' ? 'info' : m.type === 'annulation' ? 'mute' : 'warn'}>{t('mvt.' + m.type)}</Badge></td>
                    <td className={'r strong ' + (m.yards < 0 ? 'red' : 'green')}>{m.yards > 0 ? '+' : ''}{num(m.yards)} yd</td>
                    <td>{db.users.find(u => u.id === m.userId)?.nom ?? '—'}</td>
                    <td className="muted-s">{m.motif}{m.fournisseur ? ` · ${m.fournisseur}` : ''}{admin && m.prixAchatPagne ? ` · ${fcfa(m.prixAchatPagne)}/${t('unite.pagne')}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mv.length === 0 && <Empty title={t('common.aucunResultat')} />}
          </div>
        </section>
      )}

      {modal?.kind === 'produit' && <ProduitForm id={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === 'entree' && <EntreeForm vid={modal.vid} onClose={() => setModal(null)} />}
      {modal?.kind === 'ajust' && <AjustForm vid={modal.vid} onClose={() => setModal(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
function ProduitForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { db, saveProduit } = useApp();
  const { toast } = useUI();
  const existing = db.produits.find(p => p.id === id);
  const [p, setP] = useState<Produit>(existing ?? { id: uid('p_'), nom: '', type: 'Wax', motif: '', origine: '', yardsParPagne: 6, vendPagne: true, vendYard: true, prixPagne: 0, prixYard: 0, prixAchatPagne: 0 });
  const [vars, setVars] = useState<VarForm[]>(() =>
    existing ? db.variantes.filter(v => v.produitId === existing.id).map(v => ({ id: v.id, coloris: v.coloris, sku: v.sku, c1: v.c1, c2: v.c2, seuil: v.seuil })) : [{ coloris: '', sku: '', c1: '#E07A1F', c2: '#23306B', seuil: 18, stock: 0 }]);
  const [autoYard, setAutoYard] = useState(!existing);
  const up = <K extends keyof Produit>(k: K, val: Produit[K]) => setP(x => ({ ...x, [k]: val }));
  const suggest = (prixPagne: number, yards: number) => Math.round(((prixPagne / (yards || 1)) * 1.2) / 100) * 100;
  const upVar = (i: number, patch: Partial<VarForm>) => setVars(a => a.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const onColoris = (i: number, name: string) => {
    const pre = COLORIS.find(c => c[0] === name);
    upVar(i, pre ? { coloris: name, c1: pre[1], c2: pre[2] } : { coloris: name });
  };
  const suppliers = [...new Set(db.mouvements.map(m => m.fournisseur).filter(Boolean))];
  void suppliers;

  const onImage = async (file?: File) => {
    if (!file) return;
    try { up('image', await fileToDataUrl(file)); } catch { toast(t('stock.imageErreur'), 'err'); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = { ...p, nom: p.nom.trim(), motif: p.motif.trim(), origine: p.origine.trim() };
    const prefix = clean.type.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'ART';
    const withSku = vars.map((v, i) => ({ ...v, sku: v.sku.trim() || `${prefix}-${String(db.produits.length + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}` }));
    const r = saveProduit(clean, withSku);
    if (!r.ok) return toast(r.error!, 'err');
    toast(existing ? t('stock.produitModifie') : t('stock.produitAjoute'));
    onClose();
  };

  return (
    <Modal title={existing ? t('stock.modifierProduit') : t('stock.nouveauProduit')} onClose={onClose} size="lg"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="produit-form" type="submit">{t('common.enregistrer')}</button></>}>
      <form id="produit-form" onSubmit={submit} className="form-grid">
        <div className="img-pick span3">
          <Swatch c1={vars[0]?.c1 ?? '#ddd'} c2={vars[0]?.c2 ?? '#999'} seed={p.id} image={p.image} size={96} />
          <div className="img-actions">
            <label className="btn btn-sm"><LuImagePlus /> {t('stock.photo')}<input type="file" accept="image/*" hidden onChange={e => onImage(e.target.files?.[0])} /></label>
            {p.image && <button type="button" className="btn btn-sm" onClick={() => up('image', undefined)}>{t('stock.retirerPhoto')}</button>}
          </div>
        </div>
        <Field label={t('stock.nom')} className="span3"><input className="input" value={p.nom} onChange={e => up('nom', e.target.value)} required /></Field>
        <Field label={t('stock.type')}><select className="select" value={p.type} onChange={e => up('type', e.target.value)}>{TYPES.map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label={t('stock.motif')}><input className="input" value={p.motif} onChange={e => up('motif', e.target.value)} placeholder={t('stock.motifEx')} /></Field>
        <Field label={t('stock.origine')}><input className="input" value={p.origine} onChange={e => up('origine', e.target.value)} placeholder={t('stock.origineEx')} /></Field>
        <Field label={t('stock.yardsParPagne')} hint={t('stock.yardsParPagneHint')}>
          <NumInput label={t('stock.yardsParPagne')} value={p.yardsParPagne} onChange={n => { up('yardsParPagne', n); if (autoYard) up('prixYard', suggest(p.prixPagne, n)); }} />
        </Field>
        <fieldset className="span2 unites">
          <legend>{t('stock.unitesVendables')}</legend>
          <label className="check"><input type="checkbox" checked={p.vendPagne} onChange={e => up('vendPagne', e.target.checked)} /> {t('unite.pagne')}</label>
          <label className="check"><input type="checkbox" checked={p.vendYard} onChange={e => up('vendYard', e.target.checked)} /> {t('unite.yard')}</label>
        </fieldset>
        <Field label={t('stock.prixPagne')}><NumInput label={t('stock.prixPagne')} value={p.prixPagne} onChange={n => { up('prixPagne', n); if (autoYard) up('prixYard', suggest(n, p.yardsParPagne)); }} /></Field>
        <Field label={t('stock.prixYard')} hint={t('stock.prixYardHint')}><NumInput label={t('stock.prixYard')} value={p.prixYard} onChange={n => { setAutoYard(false); up('prixYard', n); }} /></Field>
        <Field label={t('stock.prixAchatPagne')}><NumInput label={t('stock.prixAchatPagne')} value={p.prixAchatPagne} onChange={n => up('prixAchatPagne', n)} /></Field>

        <div className="span3">
          <div className="panel-head tight"><h3>{t('stock.variantes')}</h3><button type="button" className="btn btn-sm" onClick={() => setVars(a => [...a, { coloris: '', sku: '', c1: '#1F8A5B', c2: '#F2C230', seuil: p.yardsParPagne * 3, stock: 0 }])}><LuPlus /> {t('stock.ajouterColoris')}</button></div>
          <datalist id="coloris-list">{COLORIS.map(c => <option key={c[0]} value={c[0]} />)}</datalist>
          <div className="var-rows">
            <div className="var-row var-head"><span>{t('stock.coloris')}</span><span>{t('stock.couleurs')}</span><span>{t('stock.sku')}</span><span>{t('stock.seuilYd')}</span><span>{t('stock.stockInitialYd')}</span><span></span></div>
            {vars.map((v, i) => (
              <div className="var-row" key={v.id ?? 'n' + i}>
                <input className="input" list="coloris-list" value={v.coloris} onChange={e => onColoris(i, e.target.value)} aria-label={t('stock.coloris')} />
                <span className="colors"><input type="color" value={v.c1} onChange={e => upVar(i, { c1: e.target.value })} aria-label={t('stock.couleur1')} /><input type="color" value={v.c2} onChange={e => upVar(i, { c2: e.target.value })} aria-label={t('stock.couleur2')} /></span>
                <input className="input" value={v.sku} onChange={e => upVar(i, { sku: e.target.value })} placeholder={t('stock.skuAuto')} aria-label={t('stock.sku')} />
                <NumInput label={t('stock.seuilYd')} value={v.seuil} onChange={n => upVar(i, { seuil: n })} />
                {v.id ? <span className="muted-s">{t('stock.viaEntree')}</span> : <NumInput label={t('stock.stockInitialYd')} value={v.stock ?? 0} onChange={n => upVar(i, { stock: n })} />}
                <button type="button" className="icon-btn danger" onClick={() => setVars(a => a.filter((_, k) => k !== i))} aria-label={t('common.supprimer')}><LuTrash2 /></button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function useVar(vid: string) {
  const { db } = useApp();
  const v = db.variantes.find(x => x.id === vid)!;
  const p = db.produits.find(x => x.id === v.produitId)!;
  return { db, v, p };
}

function EntreeForm({ vid, onClose }: { vid: string; onClose: () => void }) {
  const { entreeStock } = useApp();
  const { toast } = useUI();
  const { db, v, p } = useVar(vid);
  const [q, setQ] = useState(0);
  const [unite, setUnite] = useState<UniteVente>('pagne');
  const [fournisseur, setFournisseur] = useState('');
  const [prix, setPrix] = useState(p.prixAchatPagne);
  const [motif, setMotif] = useState('');
  const suppliers = [...new Set(db.mouvements.map(m => m.fournisseur).filter(Boolean))] as string[];
  const yards = yardsOf(p, unite, q);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = entreeStock({ varianteId: vid, quantite: q, unite, fournisseur, prixAchatPagne: prix, motif });
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('stock.entreeOk', { n: num(yards) })); onClose();
  };
  return (
    <Modal title={t('stock.entree')} onClose={onClose} size="sm"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="entree-form" type="submit">{t('stock.enregistrerEntree')}</button></>}>
      <form id="entree-form" onSubmit={submit} className="form-col">
        <div className="recap"><Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={44} /><div><div className="strong">{p.nom}</div><div className="muted-s">{v.coloris} · {t('stock.stockActuel')} {num(v.stock)} yd</div></div></div>
        <div className="row-2">
          <Field label={t('stock.quantite')}><NumInput label={t('stock.quantite')} value={q} onChange={setQ} /></Field>
          <Field label={t('stock.unite')}>
            <select className="select" value={unite} onChange={e => setUnite(e.target.value as UniteVente)}>
              <option value="pagne">{uniteLabel('pagne', 2)}</option><option value="yard">{uniteLabel('yard', 2)}</option>
            </select>
          </Field>
        </div>
        <Field label={t('stock.fournisseur')}><input className="input" list="fournisseurs" value={fournisseur} onChange={e => setFournisseur(e.target.value)} /><datalist id="fournisseurs">{suppliers.map(s => <option key={s} value={s} />)}</datalist></Field>
        <Field label={t('stock.prixAchatPagne')}><NumInput label={t('stock.prixAchatPagne')} value={prix} onChange={setPrix} /></Field>
        <Field label={t('stock.note')}><input className="input" value={motif} onChange={e => setMotif(e.target.value)} /></Field>
        {q > 0 && <p className="preview">{t('stock.apercuEntree', { y: num(yards), s: num(r2(v.stock + yards)) })}</p>}
      </form>
    </Modal>
  );
}

function AjustForm({ vid, onClose }: { vid: string; onClose: () => void }) {
  const { ajusterStock } = useApp();
  const { toast } = useUI();
  const { v, p } = useVar(vid);
  const [n, setN] = useState(v.stock);
  const [motif, setMotif] = useState('');
  const delta = r2(n - v.stock);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = ajusterStock({ varianteId: vid, nouveauStock: n, motif });
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('stock.ajustOk')); onClose();
  };
  return (
    <Modal title={t('stock.ajuster')} onClose={onClose} size="sm"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="ajust-form" type="submit">{t('common.enregistrer')}</button></>}>
      <form id="ajust-form" onSubmit={submit} className="form-col">
        <div className="recap"><Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={44} /><div><div className="strong">{p.nom}</div><div className="muted-s">{v.coloris} · {t('stock.stockActuel')} {num(v.stock)} yd</div></div></div>
        <Field label={t('stock.stockCompte')}><NumInput label={t('stock.stockCompte')} value={n} onChange={setN} /></Field>
        <Field label={t('stock.motifAjust')}><input className="input" list="motifs-ajust" value={motif} onChange={e => setMotif(e.target.value)} required /><datalist id="motifs-ajust">{[t('stock.m1'), t('stock.m2'), t('stock.m3'), t('stock.m4')].map(m => <option key={m} value={m} />)}</datalist></Field>
        {delta !== 0 && <p className="preview">{t('stock.ecart', { d: (delta > 0 ? '+' : '') + num(delta) })}</p>}
      </form>
    </Modal>
  );
}
