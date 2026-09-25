import React, { useState } from 'react';
import type { Role } from '../types';
import { useApp } from '../store';
import { t } from '../i18n';
import { Field } from '../components/ui';

// Comptes du jeu de démonstration de l'API (DemoSeeder), proposés uniquement en développement.
const DEMO: { nom: string; role: Role; identifiant: string; motDePasse: string }[] = [
  { nom: 'Kafui Amegah', role: 'admin', identifiant: 'admin', motDePasse: 'admin123' },
  { nom: 'Yawovi Dossou', role: 'vendeur', identifiant: 'yawovi', motDePasse: 'vente123' },
  { nom: 'Essenam Tagba', role: 'vendeur', identifiant: 'essenam', motDePasse: 'vente123' },
];
const SHOW_DEMO = !!import.meta.env?.DEV;

export default function Login() {
  const { login, db, notice } = useApp();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const r = await login(id, pw);
    setBusy(false);
    if (!r.ok) setErr(r.error || t('login.erreur'));
  };
  const message = err ?? notice;
  return (
    <div className="login">
      <div className="login-art" aria-hidden="true"><div className="login-art-text"><span>{db.parametres.boutique}</span></div></div>
      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <h1>{t('login.titre')}</h1>
          <p className="muted-p">{t('login.sousTitre')}</p>
          <Field label={t('login.identifiant')}><input className="input" value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoFocus /></Field>
          <Field label={t('login.motDePasse')}><input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" /></Field>
          {message && <p className="error" role="alert">{message}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? t('app.chargement') : t('login.connexion')}</button>
          {SHOW_DEMO && (
            <div className="demo">
              <h2>{t('login.demo')}</h2>
              <ul>
                {DEMO.map(u => (
                  <li key={u.identifiant}>
                    <button type="button" className="demo-row" onClick={() => { setId(u.identifiant); setPw(u.motDePasse); setErr(null); }}>
                      <span><strong>{u.nom}</strong> <em>{t('role.' + u.role)}</em></span>
                      <code>{u.identifiant} / {u.motDePasse}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
