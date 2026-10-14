import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuBell, LuCheck, LuChevronDown, LuCircleAlert, LuGlobe, LuInfo, LuLogOut, LuMonitor, LuMoon, LuSun, LuTriangleAlert } from 'react-icons/lu';
import { get } from '../api';
import { useApp } from '../store';
import { LANGUES, langue, t } from '../i18n';
import { go } from '../router';
import { choisirLangue, choisirTheme, themeEnregistre, type Theme } from '../lib/preferences';
import { cls, fmtDate } from '../lib/format';

/** Notification calculée par le serveur (voir App\Services\NotificationService). */
interface Notif { id: string; niveau: 'info' | 'warn' | 'bad'; titre: string; message: string; date?: string; lien?: string }
interface Profil { identifiant?: string; entreprise?: string | null; boutique?: string | null }

const RAFRAICHIR_MS = 5 * 60 * 1000;

/** Menu déroulant : se ferme au clic à l'extérieur et avec Échap. */
function useMenu() {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [ouvert]);
  return { ouvert, setOuvert, ref, basculer: () => setOuvert(o => !o) };
}

/** Notifications déjà lues : retenues dans ce navigateur, par compte. */
function useLues(userId: string) {
  const cle = `pagnes.notifs.lues.${userId}`;
  const [lues, setLues] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(cle) ?? '[]')); } catch { return new Set(); }
  });
  const marquer = useCallback((ids: string[]) => setLues(prev => {
    const next = new Set([...prev, ...ids]);
    // On ne garde que les plus récentes pour que la liste ne grossisse pas indéfiniment.
    try { localStorage.setItem(cle, JSON.stringify([...next].slice(-300))); } catch { /* stockage indisponible */ }
    return next;
  }), [cle]);
  return { lues, marquer };
}

const ICONES = { bad: <LuCircleAlert />, warn: <LuTriangleAlert />, info: <LuInfo /> };
const THEMES: { v: Theme; icone: React.ReactNode; cle: string }[] = [
  { v: 'clair', icone: <LuSun />, cle: 'top.clair' }, { v: 'sombre', icone: <LuMoon />, cle: 'top.sombre' }, { v: 'systeme', icone: <LuMonitor />, cle: 'top.systeme' },
];

/** Entête des espaces entreprise et plateforme : notifications, langue, apparence et profil. */
export function TopBar({ notificationsPath, espace }: { notificationsPath: string; espace: string }) {
  const { user, logout } = useApp();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [erreurNotifs, setErreurNotifs] = useState(false);
  const [profil, setProfil] = useState<Profil>({});
  const [theme, setTheme] = useState<Theme>(themeEnregistre);
  const { lues, marquer } = useLues(user!.id);
  const cloche = useMenu();
  const reglages = useMenu();
  const moi = useMenu();

  const charger = useCallback(async () => {
    try { setNotifs(await get<Notif[]>(notificationsPath)); setErreurNotifs(false); } catch { setErreurNotifs(true); }
  }, [notificationsPath]);
  useEffect(() => {
    void charger();
    const id = window.setInterval(() => void charger(), RAFRAICHIR_MS);
    return () => window.clearInterval(id);
  }, [charger]);
  useEffect(() => { void get<Profil>('/me').then(setProfil).catch(() => { /* le menu affiche ce qu'on a déjà */ }); }, []);

  const nonLues = notifs.filter(n => !lues.has(n.id));
  const initiales = user!.nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const ouvrir = (n: Notif) => { marquer([n.id]); cloche.setOuvert(false); if (n.lien) go(n.lien); };

  return (
    // Le nom de l'espace figure déjà au-dessus du titre de chaque page : ici, il ne sert qu'aux lecteurs d'écran.
    <header className="topbar" aria-label={espace}>
      <div className="topbar-actions">
        <div className="menu" ref={cloche.ref}>
          <button type="button" className="icon-btn topbar-btn" onClick={cloche.basculer} aria-expanded={cloche.ouvert} aria-haspopup="true"
            aria-label={nonLues.length ? `${t('top.notifications')} · ${t('top.nonLues', { n: String(nonLues.length) })}` : t('top.notifications')} title={t('top.notifications')}>
            <LuBell />{nonLues.length > 0 && <span className="topbar-count" key={nonLues.length}>{nonLues.length > 9 ? '9+' : nonLues.length}</span>}
          </button>
          {cloche.ouvert && (
            <div className="menu-panel notif-panel" role="dialog" aria-label={t('top.notifications')}>
              <div className="menu-head">
                <strong>{t('top.notifications')}</strong>
                {nonLues.length > 0 && <button type="button" className="link" onClick={() => marquer(nonLues.map(n => n.id))}><LuCheck /> {t('top.toutLu')}</button>}
              </div>
              {erreurNotifs ? <p className="menu-empty">{t('top.notifErreur')}</p> : notifs.length === 0 ? <p className="menu-empty">{t('top.aucuneNotif')}</p> : (
                <ul className="notif-list">
                  {notifs.map(n => (
                    <li key={n.id}>
                      <button type="button" className={cls('notif', n.niveau, !lues.has(n.id) && 'unread')} onClick={() => ouvrir(n)}>
                        <span className="notif-ico" aria-hidden="true">{ICONES[n.niveau]}</span>
                        <span className="notif-txt"><strong>{n.titre}</strong><span>{n.message}</span>{n.date && <small>{fmtDate(n.date)}</small>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="menu" ref={reglages.ref}>
          <button type="button" className="icon-btn topbar-btn" onClick={reglages.basculer} aria-expanded={reglages.ouvert} aria-haspopup="true" aria-label={`${t('top.langue')} · ${t('top.theme')}`} title={`${t('top.langue')} · ${t('top.theme')}`}>
            {theme === 'sombre' ? <LuMoon /> : theme === 'clair' ? <LuSun /> : <LuGlobe />}
          </button>
          {reglages.ouvert && (
            <div className="menu-panel" role="dialog" aria-label={`${t('top.langue')} · ${t('top.theme')}`}>
              <div className="menu-sec">
                <span className="field-label"><LuGlobe /> {t('top.langue')}</span>
                <select className="select" value={langue()} onChange={e => choisirLangue(e.target.value)} aria-label={t('top.langue')} disabled={LANGUES.length < 2}>
                  {LANGUES.map(l => <option key={l.code} value={l.code}>{l.nom}</option>)}
                </select>
              </div>
              <div className="menu-sec">
                <span className="field-label">{t('top.theme')}</span>
                <div className="seg theme-seg" role="radiogroup" aria-label={t('top.theme')}>
                  {THEMES.map(o => (
                    <button key={o.v} type="button" role="radio" aria-checked={theme === o.v} className={cls('seg-btn', theme === o.v && 'on')} onClick={() => { choisirTheme(o.v); setTheme(o.v); }}>
                      {o.icone}<span>{t(o.cle)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="menu" ref={moi.ref}>
          <button type="button" className="topbar-me" onClick={moi.basculer} aria-expanded={moi.ouvert} aria-haspopup="true" aria-label={t('top.profil')}>
            <span className="topbar-avatar" aria-hidden="true">{initiales}</span>
            <span className="topbar-me-txt"><strong>{user!.nom}</strong><small>{t('role.' + user!.role)}</small></span>
            <LuChevronDown className="topbar-chev" />
          </button>
          {moi.ouvert && (
            <div className="menu-panel profil-panel" role="dialog" aria-label={t('top.profil')}>
              <div className="profil-head">
                <span className="topbar-avatar lg" aria-hidden="true">{initiales}</span>
                <div><strong>{user!.nom}</strong><small>{t('role.' + user!.role)}</small></div>
              </div>
              <dl className="profil-facts">
                {profil.identifiant && <div><dt>{t('top.identifiant')}</dt><dd className="mono">{profil.identifiant}</dd></div>}
                {profil.entreprise && <div><dt>{t('top.entreprise')}</dt><dd>{profil.entreprise}</dd></div>}
                {profil.boutique && <div><dt>{t('top.boutique')}</dt><dd>{profil.boutique}</dd></div>}
              </dl>
              <button type="button" className="btn btn-block" onClick={() => { void logout(); }}><LuLogOut /> {t('nav.deconnexion')}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
