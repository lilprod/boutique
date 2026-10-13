import React, { useState } from 'react';
import { LuPencil, LuPlus, LuTag, LuTrash2 } from 'react-icons/lu';
import type { Promotion, UniteVente } from '../types';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { Badge, Empty, Field, Modal, NumInput, Segmented, useUI } from '../components/ui';
import { UNITES, enCours } from '../lib/calc';
import { cls, fcfa, fmtDate, num, uid } from '../lib/format';

type Statut = 'encours' | 'avenir' | 'terminee' | 'inactive';
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const statutDe = (p: Promotion): Statut => {
  if (!p.actif) return 'inactive';
  if (enCours(p)) return 'encours';
  return p.debut && p.debut > aujourdhui() ? 'avenir' : 'terminee';
};
const BADGE: Record<Statut, 'ok' | 'info' | 'mute' | 'warn'> = { encours: 'ok', avenir: 'info', terminee: 'mute', inactive: 'warn' };

export default function Promotions() {
  const { db, deletePromotion } = useApp();
  const { toast, confirm } = useUI();
  const [edit, setEdit] = useState<Promotion | 'new' | null>(null);

  const cibleDe = (p: Promotion) => {
    if (p.cible === 'tout') return t('promo.c.tout');
    if (p.cible === 'type' || p.cible === 'motif') return `${t('promo.c.' + p.cible)} : ${p.cibleTexte}`;
    if (p.cible === 'produit') return db.produits.find(x => x.id === p.produitId)?.nom ?? '—';
    const v = db.variantes.find(x => x.id === p.varianteId);
    return v ? `${db.produits.find(x => x.id === v.produitId)?.nom ?? ''} — ${v.coloris}` : '—';
  };
  const periodeDe = (p: Promotion) =>
    p.debut && p.fin ? t('promo.duAu', { d: fmtDate(p.debut), f: fmtDate(p.fin) })
      : p.debut ? t('promo.depuis', { d: fmtDate(p.debut) })
        : p.fin ? t('promo.jusqua', { d: fmtDate(p.fin) }) : t('promo.sansDate');

  const remove = async (p: Promotion) => {
    if (!(await confirm({ title: t('promo.supprimerTitre', { nom: p.nom }), message: t('promo.supprimerMsg'), confirmLabel: t('common.supprimer'), danger: true }))) return;
    const r = await deletePromotion(p.id);
    r.ok ? toast(t('promo.supprimee')) : toast(r.error!, 'err');
  };

  // En cours d'abord, puis à venir, terminées, désactivées.
  const ordre: Statut[] = ['encours', 'avenir', 'terminee', 'inactive'];
  const liste = [...db.promotions].sort((a, b) => ordre.indexOf(statutDe(a)) - ordre.indexOf(statutDe(b)));

  return (
    <>
      <div className="page-head">
        <div><h1>{t('promo.titre')}</h1><p className="muted-p">{t('promo.sousTitre')}</p></div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><LuPlus /> {t('promo.nouvelle')}</button>
      </div>
      <section className="panel">
        {liste.length === 0 ? (
          <Empty title={t('promo.aucune')}><button className="btn btn-sm btn-primary" onClick={() => setEdit('new')}><LuPlus /> {t('promo.nouvelle')}</button></Empty>
        ) : (
          <ul className="promo-list">
            {liste.map(p => {
              const s = statutDe(p);
              return (
                <li key={p.id} className={cls('promo-row', (s === 'terminee' || s === 'inactive') && 'off')}>
                  <span className="promo-val">{p.typeRemise === 'pct' ? `−${num(p.valeur)} %` : `−${fcfa(p.valeur)}`}</span>
                  <div className="grow">
                    <div className="owner-top"><strong>{p.nom}</strong><Badge kind={BADGE[s]}>{t('promo.s.' + s)}</Badge></div>
                    <div className="muted-s">
                      <LuTag /> {cibleDe(p)}
                      {p.unite && ` · ${t('promo.parUnite', { unite: uniteLabel(p.unite, 1) })}`}
                      {p.quantiteMin > 0 && ` · ${t('promo.des', { n: num(p.quantiteMin) })}`}
                      {` · ${periodeDe(p)}`}
                    </div>
                  </div>
                  <button className="icon-btn" aria-label={t('common.modifier')} title={t('common.modifier')} onClick={() => setEdit(p)}><LuPencil /></button>
                  <button className="icon-btn danger" aria-label={t('common.supprimer')} title={t('common.supprimer')} onClick={() => void remove(p)}><LuTrash2 /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {edit && <PromotionForm promo={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PromotionForm({ promo, onClose }: { promo?: Promotion; onClose: () => void }) {
  const { db, savePromotion } = useApp();
  const { toast } = useUI();
  const [p, setP] = useState<Promotion>(promo ?? { id: uid('promo_'), nom: '', typeRemise: 'pct', valeur: 10, cible: 'tout', quantiteMin: 0, actif: true });
  const [busy, setBusy] = useState(false);
  const up = <K extends keyof Promotion>(k: K, v: Promotion[K]) => setP(x => ({ ...x, [k]: v }));

  const uniq = (a: string[]) => [...new Set(a.map(x => x.trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  const types = uniq(db.produits.map(x => x.type));
  const motifs = uniq(db.produits.map(x => x.motif));
  const produits = [...db.produits].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const uniteRequise = p.typeRemise === 'fcfa' || p.quantiteMin > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await savePromotion(p);
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('promo.enregistree')); onClose();
  };

  return (
    <Modal title={promo ? t('promo.modifier') : t('promo.nouvelle')} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="promo-form" type="submit" disabled={busy}>{t('common.enregistrer')}</button></>}>
      <form id="promo-form" className="form-col" onSubmit={submit}>
        <Field label={t('promo.nom')}><input className="input" value={p.nom} onChange={e => up('nom', e.target.value)} placeholder={t('promo.nomEx')} maxLength={120} required /></Field>

        <div className="row-2">
          <div className="field"><span className="field-label">{t('promo.remise')}</span>
            <Segmented label={t('promo.remise')} value={p.typeRemise} onChange={v => up('typeRemise', v)} options={[{ v: 'pct', label: t('promo.pct') }, { v: 'fcfa', label: t('promo.fcfa') }]} />
          </div>
          <Field label={p.typeRemise === 'pct' ? t('promo.valeurPct') : t('promo.valeurFcfa')}>
            <NumInput label={t('promo.remise')} value={p.valeur} onChange={n => up('valeur', p.typeRemise === 'pct' ? Math.min(100, n) : n)} step={p.typeRemise === 'pct' ? 1 : 500} />
          </Field>
        </div>

        <Field label={t('promo.cible')}>
          <select className="select" value={p.cible} onChange={e => setP(x => ({ ...x, cible: e.target.value as Promotion['cible'], cibleTexte: undefined, produitId: undefined, varianteId: undefined }))}>
            {(['tout', 'type', 'motif', 'produit', 'variante'] as const).map(c => <option key={c} value={c}>{t('promo.c.' + c)}</option>)}
          </select>
        </Field>
        {(p.cible === 'type' || p.cible === 'motif') && (
          <Field label={t('promo.c.' + p.cible)}>
            <select className="select" value={p.cibleTexte ?? ''} onChange={e => up('cibleTexte', e.target.value || undefined)} required>
              <option value="">{t('promo.choisir')}</option>
              {(p.cible === 'type' ? types : motifs).map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
        )}
        {p.cible === 'produit' && (
          <Field label={t('promo.c.produit')}>
            <select className="select" value={p.produitId ?? ''} onChange={e => up('produitId', e.target.value || undefined)} required>
              <option value="">{t('promo.choisir')}</option>
              {produits.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select>
          </Field>
        )}
        {p.cible === 'variante' && (
          <Field label={t('promo.c.variante')}>
            <select className="select" value={p.varianteId ?? ''} onChange={e => up('varianteId', e.target.value || undefined)} required>
              <option value="">{t('promo.choisir')}</option>
              {produits.map(pr => (
                <optgroup key={pr.id} label={pr.nom}>
                  {db.variantes.filter(v => v.produitId === pr.id).map(v => <option key={v.id} value={v.id}>{v.coloris}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        )}

        <div className="row-2">
          <Field label={t('promo.unite')} hint={uniteRequise ? t('promo.uniteHint') : undefined}>
            <select className="select" value={p.unite ?? ''} onChange={e => up('unite', (e.target.value || undefined) as UniteVente | undefined)} required={uniteRequise}>
              <option value="">{t('promo.toutesUnites')}</option>
              {UNITES.map(u => <option key={u} value={u}>{uniteLabel(u, 1)}</option>)}
            </select>
          </Field>
          <Field label={t('promo.quantiteMin')} hint={t('promo.quantiteMinHint')}>
            <NumInput label={t('promo.quantiteMin')} value={p.quantiteMin} onChange={n => up('quantiteMin', n)} step={1} />
          </Field>
        </div>

        <div className="row-2">
          <Field label={t('promo.debut')}><input className="input" type="date" value={p.debut ?? ''} max={p.fin} onChange={e => up('debut', e.target.value || undefined)} /></Field>
          <Field label={t('promo.fin')} hint={t('promo.datesHint')}><input className="input" type="date" value={p.fin ?? ''} min={p.debut} onChange={e => up('fin', e.target.value || undefined)} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={p.actif} onChange={e => up('actif', e.target.checked)} /> {t('promo.active')}</label>
      </form>
    </Modal>
  );
}
