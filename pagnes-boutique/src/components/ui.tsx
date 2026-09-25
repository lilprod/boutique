import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuMinus, LuPlus, LuTriangleAlert, LuX } from 'react-icons/lu';
import { t } from '../i18n';
import { cls, hash } from '../lib/format';

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, size = 'md' }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button.btn')?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal ' + size} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.fermer')}><LuX /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- Toasts et confirmations ---------- */
interface ConfirmOpts { title: string; message: string; confirmLabel?: string; danger?: boolean }
interface UICtx { toast: (m: string, kind?: 'ok' | 'err') => void; confirm: (o: ConfirmOpts) => Promise<boolean> }
const UI = createContext<UICtx | null>(null);
export const useUI = () => { const c = useContext(UI); if (!c) throw new Error('UIProvider manquant'); return c; };

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; m: string; kind: 'ok' | 'err' }[]>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const n = useRef(0);
  const toast = useCallback((m: string, kind: 'ok' | 'err' = 'ok') => {
    const id = ++n.current;
    setToasts(x => [...x, { id, m, kind }]);
    setTimeout(() => setToasts(x => x.filter(y => y.id !== id)), kind === 'err' ? 6000 : 3200);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => setDlg({ ...o, resolve })), []);
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null); };
  return (
    <UI.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(x => (
          <div key={x.id} className={'toast ' + x.kind}>{x.kind === 'ok' ? <LuCheck /> : <LuTriangleAlert />}<span>{x.m}</span></div>
        ))}
      </div>
      {dlg && (
        <Modal title={dlg.title} size="sm" onClose={() => close(false)}
          footer={<><button className="btn" onClick={() => close(false)}>{t('common.annuler')}</button>
            <button className={cls('btn', dlg.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)}>{dlg.confirmLabel || t('common.confirmer')}</button></>}>
          <p className="muted-p">{dlg.message}</p>
        </Modal>
      )}
    </UI.Provider>
  );
}

/* ---------- Petits composants ---------- */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <label className={cls('field', className)}><span className="field-label">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: React.ReactNode }) {
  return <span className={'badge ' + kind}>{children}</span>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={cls('seg-btn', value === o.v && 'on')} onClick={() => onChange(o.v)}>{o.icon}{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty"><p>{title}</p>{children}</div>;
}

/** Nombre décimal saisi au clavier (virgule ou point), avec boutons − / +. */
export function NumInput({ value, onChange, step = 0.5, min = 0, stepper = false, label, className }: { value: number; onChange: (n: number) => void; step?: number; min?: number; stepper?: boolean; label: string; className?: string }) {
  const show = (n: number) => (n === 0 ? '' : String(n).replace('.', ','));
  const [txt, setTxt] = useState(show(value));
  const parse = (s: string) => { const c = s.replace(',', '.').trim(); return c === '' ? 0 : /^\d*\.?\d*$/.test(c) ? parseFloat(c) || 0 : null; };
  useEffect(() => { if (parse(txt) !== value) setTxt(show(value)); /* eslint-disable-next-line */ }, [value]);
  const input = (
    <input className={cls('input num', className)} inputMode="decimal" aria-label={label} value={txt}
      onChange={e => { setTxt(e.target.value); const n = parse(e.target.value); if (n !== null) onChange(n); }}
      onBlur={() => setTxt(show(value))} onFocus={e => e.target.select()} />
  );
  if (!stepper) return input;
  const bump = (d: number) => onChange(Math.max(min, Math.round((value + d) * 100) / 100));
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" onClick={() => bump(-step)} aria-label={label + ' −'}><LuMinus /></button>
      {input}
      <button type="button" className="icon-btn" onClick={() => bump(step)} aria-label={label + ' +'}><LuPlus /></button>
    </div>
  );
}

/** Aperçu d'étoffe : image du produit, sinon un motif généré à partir des deux couleurs du coloris. */
export function Swatch({ c1, c2, seed, image, size = 40 }: { c1: string; c2: string; seed: string; image?: string; size?: number }) {
  if (image) return <img className="swatch" src={image} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  const k = hash(seed) % 4;
  return (
    <svg className="swatch" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" fill={c1} />
      {k === 0 && <g fill={c2}>{[[10, 10], [30, 10], [10, 30], [30, 30]].map(([x, y]) => <circle key={x + '-' + y} cx={x} cy={y} r="5" />)}<circle cx="20" cy="20" r="3.5" /></g>}
      {k === 1 && <g fill={c2}>{[4, 14, 24, 34].map(x => <rect key={x} x={x} y="0" width="4" height="40" />)}</g>}
      {k === 2 && <g fill={c2}>{[[10, 10], [30, 10], [10, 30], [30, 30], [20, 20]].map(([x, y]) => <path key={x + '-' + y} d={`M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z`} />)}</g>}
      {k === 3 && <g fill="none" stroke={c2} strokeWidth="2.5"><circle cx="20" cy="20" r="14" /><circle cx="20" cy="20" r="7" /><circle cx="20" cy="20" r="1.5" fill={c2} /></g>}
    </svg>
  );
}

export const PrintRoot = ({ children }: { children: React.ReactNode }) => {
  const el = document.getElementById('print-root');
  return el ? createPortal(children, el) : null;
};

export function doPrint(format: '80mm' | 'A4') {
  const s = document.createElement('style');
  s.textContent = format === '80mm' ? '@page{size:80mm auto;margin:2mm}' : '@page{size:A4;margin:14mm}';
  document.head.appendChild(s);
  window.print();
  setTimeout(() => s.remove(), 1500);
}

/** Réduit une photo (360 px au plus) et la ré-encode en JPEG : `blob` part vers l'API, `preview` (URL locale) sert à l'aperçu. */
export async function resizeImage(file: File, max = 360): Promise<{ blob: Blob; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encodage'))), 'image/jpeg', 0.82));
    return { blob, preview: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
