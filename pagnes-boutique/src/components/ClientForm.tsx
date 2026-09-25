import React, { useState } from 'react';
import type { Client } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Field, Modal, useUI } from './ui';
import { uid } from '../lib/format';

export function ClientForm({ client, onClose, onSaved }: { client?: Client; onClose: () => void; onSaved?: (c: Client) => void }) {
  const { saveClient } = useApp();
  const { toast } = useUI();
  const [c, setC] = useState<Client>(client ?? { id: uid('c_'), nom: '', telephone: '', adresse: '', creeLe: new Date().toISOString() });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await saveClient({ ...c, nom: c.nom.trim() });
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    toast(client ? t('clients.modifie') : t('clients.ajoute'));
    onSaved?.(r.data!); onClose(); // r.data : le client tel qu'enregistré (identifiant du serveur)
  };
  return (
    <Modal title={client ? t('clients.modifier') : t('clients.nouveau')} onClose={onClose} size="sm"
      footer={<><button className="btn" type="button" onClick={onClose}>{t('common.annuler')}</button><button className="btn btn-primary" form="client-form" type="submit" disabled={busy}>{t('common.enregistrer')}</button></>}>
      <form id="client-form" onSubmit={submit} className="form-col">
        <Field label={t('clients.nom')}><input className="input" value={c.nom} onChange={e => setC({ ...c, nom: e.target.value })} required /></Field>
        <Field label={t('clients.telephone')}><input className="input" inputMode="tel" value={c.telephone} onChange={e => setC({ ...c, telephone: e.target.value })} placeholder="+228 90 00 00 00" /></Field>
        <Field label={t('clients.adresse')}><input className="input" value={c.adresse} onChange={e => setC({ ...c, adresse: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
