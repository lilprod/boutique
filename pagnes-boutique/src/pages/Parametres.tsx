import React, { useState } from 'react';
import { LuPencil, LuPlus, LuTrash2, LuX } from 'react-icons/lu';
import type { Parametres as P, Proprietaire, Role, UniteVente, User } from '../types';
import { autorise, pagneSeul, pointsGagnes, remisePoints, UNITES } from '../lib/calc';
import { useApp } from '../store';
import { t } from '../i18n';
import { Badge, Empty, Field, Modal, NumInput, Segmented, useUI } from '../components/ui';
import { cls, fcfa, num, uid } from '../lib/format';

export default function Parametres() {
  const { db, saveParametres } = useApp();
  const { toast, confirm } = useUI();
  const [p, setP] = useState<P>(db.parametres);
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const up = <K extends keyof P>(k: K, v: P[K]) => setP(x => ({ ...x, [k]: v }));

  const champUnite = { pagne: 'autorisePagne', yard: 'autoriseYard', metre: 'autoriseMetre' } as const;
  const nbAutorisees = UNITES.filter(u => autorise(p, u)).length;
  const toggleUnite = (u: UniteVente, on: boolean) => setP(x => {
    const next = { ...x, [champUnite[u]]: on };
    // Passage en vente au gros (pagne seul) : on propose le stock en pagnes, sans l'imposer.
    if (pagneSeul(next) && !pagneSeul(x)) next.uniteStock = 'pagne';
    return next;
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (p.uniteStock !== db.parametres.uniteStock
      && !(await confirm({ title: t('param.uniteStock'), message: t('param.uniteStockConfirm'), confirmLabel: t('common.enregistrer') }))) return;
    setBusy(true);
    const r = await saveParametres({ ...p, remiseMaxVendeur: Math.min(100, p.remiseMaxVendeur) });
    setBusy(false);
    r.ok ? toast(t('param.enregistre')) : toast(r.error!, 'err');
  };

  return (
    <>
      <div className="page-head"><div><h1>{t('param.titre')}</h1><p className="muted-p">{t('param.sousTitre')}</p></div></div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><h2>{t('param.boutique')}</h2><p className="panel-sub">{t('param.ticketSous')}</p></div></div>
          <form className="form-col" onSubmit={save}>
            <Field label={t('param.nom')}><input className="input" value={p.boutique} onChange={e => up('boutique', e.target.value)} required /></Field>
            <Field label={t('param.adresse')}><input className="input" value={p.adresse} onChange={e => up('adresse', e.target.value)} /></Field>
            <Field label={t('param.telephone')}><input className="input" value={p.telephone} onChange={e => up('telephone', e.target.value)} /></Field>
            <Field label={t('param.messageTicket')}><textarea className="input" rows={3} value={p.messageTicket} onChange={e => up('messageTicket', e.target.value)} /></Field>
            <div className="field"><span className="field-label">{t('param.formatTicket')}</span>
              <Segmented label={t('param.formatTicket')} value={p.ticketFormat} onChange={v => up('ticketFormat', v)} options={[{ v: '80mm', label: t('ticket.thermique') }, { v: 'A4', label: 'A4' }]} /></div>
            <Field label={t('param.remiseMax')} hint={t('param.remiseMaxHint')}><NumInput label={t('param.remiseMax')} value={p.remiseMaxVendeur} onChange={n => up('remiseMaxVendeur', n)} step={1} /></Field>

            <div className="form-section">
            <div className="form-section-head"><h3>{t('param.politique')}</h3><p className="panel-sub">{t('param.politiqueSous')}</p></div>
            <fieldset className="unites">
              <legend className="field-label">{t('param.unitesAutorisees')}</legend>
              {UNITES.map(u => {
                const on = autorise(p, u);
                return (
                  <label key={u} className="check">
                    {/* La dernière unité cochée ne peut pas être retirée : une boutique vend toujours quelque chose. */}
                    <input type="checkbox" checked={on} disabled={on && nbAutorisees === 1} onChange={e => toggleUnite(u, e.target.checked)} /> {t('unite.' + u)}
                  </label>
                );
              })}
              <div className="hint">{t('param.unitesHint')}</div>
            </fieldset>
            <Field label={t('param.quantiteMin')} hint={pagneSeul(p) ? t('param.quantiteMinHint') : t('param.quantiteMinInactif')}>
              <NumInput label={t('param.quantiteMin')} value={p.quantiteMinPanier} onChange={n => up('quantiteMinPanier', Math.max(1, n))} step={1} disabled={!pagneSeul(p)} />
            </Field>
            <div className="field"><span className="field-label">{t('param.uniteStock')}</span>
              <Segmented label={t('param.uniteStock')} value={p.uniteStock} onChange={v => up('uniteStock', v)}
                options={UNITES.map(u => ({ v: u, label: t('unite.' + u) }))} />
              <span className="hint">{t('param.uniteStockHint')}</span>
            </div>
            <div className="field">
              <label className="check"><input type="checkbox" checked={p.multiProprietaires} onChange={e => up('multiProprietaires', e.target.checked)} /> {t('param.multiProprietaires')}</label>
              <span className="hint">{t('param.multiProprietairesHint')}</span>
            </div>
            </div>

            <div className="form-section">
              <div className="form-section-head"><h3>{t('fid.titre')}</h3><p className="panel-sub">{t('fid.sous')}</p></div>
              <label className="check"><input type="checkbox" checked={p.fideliteActive} onChange={e => up('fideliteActive', e.target.checked)} /> {t('fid.activer')}</label>
              {p.fideliteActive && (
                <>
                  <div className="row-2">
                    <Field label={t('fid.tranche')}><NumInput label={t('fid.tranche')} value={p.fideliteTranche} onChange={n => up('fideliteTranche', Math.max(1, Math.round(n)))} step={500} /></Field>
                    <Field label={t('fid.valeur')}><NumInput label={t('fid.valeur')} value={p.fideliteValeurPoint} onChange={n => up('fideliteValeurPoint', Math.max(1, Math.round(n)))} step={1} /></Field>
                  </div>
                  <div className="row-2">
                    <Field label={t('fid.seuil')}><NumInput label={t('fid.seuil')} value={p.fideliteSeuil} onChange={n => up('fideliteSeuil', Math.max(0, Math.round(n)))} step={10} /></Field>
                    <Field label={t('fid.expiration')} hint={t('fid.expirationHint')}><NumInput label={t('fid.expiration')} value={p.fideliteExpirationMois} onChange={n => up('fideliteExpirationMois', Math.max(0, Math.round(n)))} step={1} /></Field>
                  </div>
                  <p className="notice ok">{t('fid.exemple', {
                    achat: fcfa(50000), pts: num(pointsGagnes(p, 50000)),
                    seuil: num(Math.max(p.fideliteSeuil, 1)), remise: fcfa(remisePoints(p, Math.max(p.fideliteSeuil, 1))),
                    taux: num(Math.round((p.fideliteValeurPoint / Math.max(1, p.fideliteTranche)) * 1000) / 10),
                  })}</p>
                </>
              )}
            </div>

            <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{t('common.enregistrer')}</button></div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head"><div><h2>{t('param.utilisateurs')}</h2><p className="panel-sub">{t('param.utilisateursSous')}</p></div><button className="btn btn-sm" onClick={() => setEdit('new')}><LuPlus /> {t('param.ajouterUtilisateur')}</button></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('param.nom')}</th><th>{t('login.identifiant')}</th><th>{t('param.role')}</th><th>{t('stock.statut')}</th><th></th></tr></thead>
              <tbody>
                {db.users.map(u => (
                  <tr key={u.id}>
                    <td className="strong">{u.nom}</td><td>{u.identifiant}</td><td>{t('role.' + u.role)}</td>
                    <td><Badge kind={u.actif ? 'ok' : 'mute'}>{u.actif ? t('param.actif') : t('param.inactif')}</Badge></td>
                    <td className="r"><button className="icon-btn" aria-label={t('common.modifier')} title={t('common.modifier')} onClick={() => setEdit(u)}><LuPencil /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint pad">{t('param.securiteNote')}</p>
        </section>
      </div>
      {/* Visible une fois l'option enregistrée : la liste dépend de la boutique, pas du formulaire en cours. */}
      {db.parametres.multiProprietaires && <Proprietaires />}
      {edit && <UserForm user={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Proprietaires() {
  const { db, deleteProprietaire } = useApp();
  const { toast, confirm } = useUI();
  const [edit, setEdit] = useState<Proprietaire | 'new' | null>(null);
  const nomCompte = (id?: string) => db.users.find(u => u.id === id)?.nom;

  const remove = async (pr: Proprietaire) => {
    if (!(await confirm({ title: t('prop.supprimerTitre', { nom: pr.nom }), message: t('prop.supprimerMsg'), confirmLabel: t('common.supprimer'), danger: true }))) return;
    const r = await deleteProprietaire(pr.id);
    r.ok ? toast(t('prop.supprime')) : toast(r.error!, 'err');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>{t('prop.gestion')}</h2><p className="panel-sub">{t('prop.gestionHint')}</p></div>
        <button className="btn btn-sm" onClick={() => setEdit('new')}><LuPlus /> {t('prop.ajouter')}</button>
      </div>
      {db.proprietaires.length === 0 ? <Empty title={t('prop.aucun')} /> : (
        <ul className="owner-list">
          {db.proprietaires.map(pr => (
            <li key={pr.id} className={cls('owner-row', !pr.actif && 'off')}>
              <div className="grow">
                <div className="owner-top">
                  <strong>{pr.nom}</strong>
                  <Badge kind={pr.actif ? 'ok' : 'mute'}>{pr.actif ? t('prop.actif') : t('prop.inactif')}</Badge>
                  <span className="muted-s">{t('prop.produits', { n: String(pr.nbProduits) })}{nomCompte(pr.userId) ? ` · ${nomCompte(pr.userId)}` : ''}</span>
                </div>
                {pr.motifs.length > 0
                  ? <div className="tags">{pr.motifs.map(m => <span key={m} className="tag">{m}</span>)}</div>
                  : <div className="muted-s">{t('prop.aucunMotif')}</div>}
              </div>
              <button className="icon-btn" aria-label={t('common.modifier')} title={t('common.modifier')} onClick={() => setEdit(pr)}><LuPencil /></button>
              <button className="icon-btn danger" aria-label={t('common.supprimer')} title={t('common.supprimer')} onClick={() => void remove(pr)}><LuTrash2 /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && <ProprietaireForm proprietaire={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function ProprietaireForm({ proprietaire, onClose }: { proprietaire?: Proprietaire; onClose: () => void }) {
  const { db, saveProprietaire } = useApp();
  const { toast } = useUI();
  const [pr, setPr] = useState<Proprietaire>(proprietaire ?? { id: uid('pr_'), nom: '', actif: true, motifs: [], nbProduits: 0 });
  const [saisie, setSaisie] = useState('');
  const [busy, setBusy] = useState(false);
  // Suggestions : motifs du catalogue qui ne sont pas déjà attribués à quelqu'un d'autre.
  const prisAilleurs = new Set(db.proprietaires.filter(x => x.id !== pr.id).flatMap(x => x.motifs.map(m => m.toLowerCase())));
  const suggestions = [...new Set(db.produits.map(p => p.motif.trim()).filter(Boolean))]
    .filter(m => !prisAilleurs.has(m.toLowerCase()) && !pr.motifs.some(x => x.toLowerCase() === m.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'fr'));

  const ajouterMotif = (m: string) => {
    const v = m.trim();
    if (v && !pr.motifs.some(x => x.toLowerCase() === v.toLowerCase())) setPr(x => ({ ...x, motifs: [...x.motifs, v] }));
    setSaisie('');
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await saveProprietaire({ ...pr, motifs: saisie.trim() ? [...pr.motifs, saisie.trim()] : pr.motifs });
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('prop.enregistre')); onClose();
  };

  return (
    <Modal title={proprietaire ? t('prop.modifier') : t('prop.ajouter')} onClose={onClose} size="sm"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="prop-form" type="submit" disabled={busy}>{t('common.enregistrer')}</button></>}>
      <form id="prop-form" className="form-col" onSubmit={submit}>
        <Field label={t('prop.nom')}><input className="input" value={pr.nom} onChange={e => setPr({ ...pr, nom: e.target.value })} required /></Field>
        <Field label={t('prop.compte')}>
          <select className="select" value={pr.userId ?? ''} onChange={e => setPr({ ...pr, userId: e.target.value || undefined })}>
            <option value="">{t('prop.aucunCompte')}</option>
            {db.users.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </Field>
        <Field label={t('prop.motifs')} hint={t('prop.motifsHint')}>
          <div className="tag-input">
            {pr.motifs.map(m => (
              <span key={m} className="tag">{m}<button type="button" onClick={() => setPr(x => ({ ...x, motifs: x.motifs.filter(y => y !== m) }))} aria-label={`${t('common.supprimer')} ${m}`}><LuX /></button></span>
            ))}
            <input className="input" list="motifs-catalogue" value={saisie} placeholder={t('prop.ajouterMotif')}
              onChange={e => { const v = e.target.value; suggestions.includes(v) ? ajouterMotif(v) : setSaisie(v); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); ajouterMotif(saisie); } }} />
            <datalist id="motifs-catalogue">{suggestions.map(m => <option key={m} value={m} />)}</datalist>
          </div>
        </Field>
        <label className="check"><input type="checkbox" checked={pr.actif} onChange={e => setPr({ ...pr, actif: e.target.checked })} /> {t('prop.compteActif')}</label>
      </form>
    </Modal>
  );
}

function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const { saveUser } = useApp();
  const { toast } = useUI();
  const [u, setU] = useState<User>(user ?? { id: uid('u_'), nom: '', identifiant: '', motDePasse: '', role: 'vendeur', actif: true });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await saveUser(u);
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(t('param.utilisateurOk')); onClose();
  };
  return (
    <Modal title={user ? t('param.modifierUtilisateur') : t('param.ajouterUtilisateur')} onClose={onClose} size="sm"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="user-form" type="submit" disabled={busy}>{t('common.enregistrer')}</button></>}>
      <form id="user-form" className="form-col" onSubmit={submit}>
        <Field label={t('param.nom')}><input className="input" value={u.nom} onChange={e => setU({ ...u, nom: e.target.value })} required /></Field>
        <Field label={t('login.identifiant')}><input className="input" value={u.identifiant} onChange={e => setU({ ...u, identifiant: e.target.value })} required /></Field>
        <Field label={t('login.motDePasse')} hint={user ? t('param.mdpGarder') : t('param.mdpMin')}>
          <input className="input" type="password" autoComplete="new-password" minLength={6} value={u.motDePasse} onChange={e => setU({ ...u, motDePasse: e.target.value })} required={!user} />
        </Field>
        <Field label={t('param.role')}>
          <select className="select" value={u.role} onChange={e => setU({ ...u, role: e.target.value as Role })}>
            <option value="vendeur">{t('role.vendeur')}</option>
            <option value="admin">{t('role.admin')}</option>
            <option value="boutique_admin">{t('role.boutique_admin')}</option>
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={u.actif} onChange={e => setU({ ...u, actif: e.target.checked })} /> {t('param.compteActif')}</label>
      </form>
    </Modal>
  );
}
