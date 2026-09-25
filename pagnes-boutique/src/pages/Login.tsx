import React, { useState } from 'react';
import { useApp } from '../store';
import { t } from '../i18n';
import { Field } from '../components/ui';

export default function Login() {
  const { login, db } = useApp();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setErr(!login(id, pw)); };
  const demo = db.users.filter(u => u.actif);
  return (
    <div className="login">
      <div className="login-art" aria-hidden="true"><div className="login-art-text"><span>{db.parametres.boutique}</span></div></div>
      <main className="login-main">
        <form className="login-card" onSubmit={submit}>
          <h1>{t('login.titre')}</h1>
          <p className="muted-p">{t('login.sousTitre')}</p>
          <Field label={t('login.identifiant')}><input className="input" value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoFocus /></Field>
          <Field label={t('login.motDePasse')}><input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" /></Field>
          {err && <p className="error" role="alert">{t('login.erreur')}</p>}
          <button className="btn btn-primary btn-block" type="submit">{t('login.connexion')}</button>
          <div className="demo">
            <h2>{t('login.demo')}</h2>
            <ul>
              {demo.map(u => (
                <li key={u.id}>
                  <button type="button" className="demo-row" onClick={() => { setId(u.identifiant); setPw(u.motDePasse); setErr(false); }}>
                    <span><strong>{u.nom}</strong> <em>{t('role.' + u.role)}</em></span>
                    <code>{u.identifiant} / {u.motDePasse}</code>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </form>
      </main>
    </div>
  );
}
