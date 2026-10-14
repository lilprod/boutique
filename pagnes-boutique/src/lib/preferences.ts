/** Préférences d'affichage propres à ce navigateur : thème et langue. */
import { LANGUES, langue, setLang } from '../i18n';

export type Theme = 'systeme' | 'clair' | 'sombre';
const CLE_THEME = 'pagnes.theme';
const CLE_LANGUE = 'pagnes.langue';

const lire = (cle: string) => { try { return localStorage.getItem(cle); } catch { return null; } };
const ecrire = (cle: string, v: string) => { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } };

export const themeEnregistre = (): Theme => {
  const v = lire(CLE_THEME);
  return v === 'clair' || v === 'sombre' ? v : 'systeme';
};

/** `data-theme` force le thème ; absent, styles.css suit le réglage du système. */
export function appliquerTheme(theme: Theme) {
  const racine = document.documentElement;
  if (theme === 'systeme') racine.removeAttribute('data-theme');
  else racine.setAttribute('data-theme', theme === 'sombre' ? 'dark' : 'light');
}

export function choisirTheme(theme: Theme) {
  ecrire(CLE_THEME, theme);
  appliquerTheme(theme);
}

/** À appeler avant le premier rendu : évite un flash du mauvais thème et applique la langue choisie. */
export function appliquerPreferences() {
  appliquerTheme(themeEnregistre());
  const l = lire(CLE_LANGUE);
  if (l && LANGUES.some(x => x.code === l)) setLang(l);
  document.documentElement.lang = langue(); // lecteurs d'écran, césure, correcteur du navigateur
}

/** Les textes sont lus au rendu : recharger la page les remet tous dans la nouvelle langue. */
export function choisirLangue(code: string) {
  ecrire(CLE_LANGUE, code);
  window.location.reload();
}
