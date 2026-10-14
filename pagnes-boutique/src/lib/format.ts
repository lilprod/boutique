import { langue } from '../i18n';
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const NB = '\u00a0';
/** Dates dans la langue de l'interface ; les montants gardent la convention r\u00e9gionale (espaces entre milliers, FCFA). */
const LOCALE_DATES: Record<string, string> = { fr: 'fr-FR', en: 'en-GB' };
const localeDates = () => LOCALE_DATES[langue()] ?? 'fr-FR';

export const fcfa = (n: number) => nf0.format(Math.round(n)).replace(/[\u202f\u00a0]/g, NB) + NB + 'FCFA';
export const num = (n: number) => nf2.format(n).replace(/[\u202f\u00a0]/g, NB);
export const compact = (n: number) =>
  n >= 1e6 ? num(Math.round(n / 1e5) / 10) + NB + 'M' : n >= 1e3 ? Math.round(n / 1e3) + NB + 'k' : String(Math.round(n));
export const r2 = (n: number) => Math.round(n * 100) / 100;

export const dayKey = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(localeDates(), { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(localeDates(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDayShort = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeDates(), { day: '2-digit', month: 'short' });
};

export const uid = (p: string) => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const cls = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const numeroVente = (n: number) => 'V-' + String(n).padStart(5, '0');
export const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
