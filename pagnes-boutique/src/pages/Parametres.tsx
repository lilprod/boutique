import React, { useState } from 'react';
import { LuPencil, LuPlus } from 'react-icons/lu';
import type { Parametres as P, Role, User } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Badge, Field, Modal, NumInput, Segmented, useUI } from '../components/ui';
import { uid } from '../lib/format';

export default function Parametres() {
  const { db, saveParametres } = useApp();
  const { toast } = useUI();
  const [p, setP] = useState<P>(db.parametres);
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const up = <K extends keyof P>(k: K, v: P[K]) => setP(x => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
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
          <div className="panel-head"><h2>{t('param.boutique')}</h2></div>
          <form className="form-col" onSubmit={save}>
            <Field label={t('param.nom')}><input className="input" value={p.boutique} onChange={e => up('boutique', e.target.value)} required /></Field>
            <Field label={t('param.adresse')}><input className="input" value={p.adresse} onChange={e => up('adresse', e.target.value)} /></Field>
            <Field label={t('param.telephone')}><input className="input" value={p.telephone} onChange={e => up('telephone', e.target.value)} /></Field>
            <Field label={t('param.messageTicket')}><textarea className="input" rows={3} value={p.messageTicket} onChange={e => up('messageTicket', e.target.value)} /></Field>
            <div className="field"><span className="field-label">{t('param.formatTicket')}</span>
              <Segmented label={t('param.formatTicket')} value={p.ticketFormat} onChange={v => up('ticketFormat', v)} options={[{ v: '80mm', label: t('ticket.thermique') }, { v: 'A4', label: 'A4' }]} /></div>
            <Field label={t('param.remiseMax')} hint={t('param.remiseMaxHint')}><NumInput label={t('param.remiseMax')} value={p.remiseMaxVendeur} onChange={n => up('remiseMaxVendeur', n)} step={1} /></Field>
            <div><button className="btn btn-primary" type="submit" disabled={busy}>{t('common.enregistrer')}</button></div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>{t('param.utilisateurs')}</h2><button className="btn btn-sm" onClick={() => setEdit('new')}><LuPlus /> {t('param.ajouterUtilisateur')}</button></div>
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
      {edit && <UserForm user={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
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
          <select className="select" value={u.role} onChange={e => setU({ ...u, role: e.target.value as Role })}><option value="vendeur">{t('role.vendeur')}</option><option value="admin">{t('role.admin')}</option></select>
        </Field>
        <label className="check"><input type="checkbox" checked={u.actif} onChange={e => setU({ ...u, actif: e.target.checked })} /> {t('param.compteActif')}</label>
      </form>
    </Modal>
  );
}
