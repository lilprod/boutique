import React, { useMemo, useState } from 'react';
import { LuBanknote, LuCheck, LuCreditCard, LuPlus, LuSearch, LuSmartphone, LuTrash2, LuUserPlus } from 'react-icons/lu';
import type { CartLine, ModePaiement, Remise, UniteVente, Vente } from '../types';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { Badge, NumInput, Segmented, Swatch, useUI } from '../components/ui';
import { TicketModal } from '../components/TicketModal';
import { ClientForm } from '../components/ClientForm';
import { buildLignes, totaux } from '../lib/calc';
import { cls, fcfa, norm, num, numeroVente, r2 } from '../lib/format';

const MODES: { v: ModePaiement; icon: React.ReactNode }[] = [
  { v: 'especes', icon: <LuBanknote /> }, { v: 'flooz', icon: <LuSmartphone /> }, { v: 'tmoney', icon: <LuSmartphone /> }, { v: 'carte', icon: <LuCreditCard /> },
];
const ZERO: Remise = { type: 'pct', valeur: 0 };

export default function Caisse() {
  const { db, user, validerVente } = useApp();
  const { toast } = useUI();
  const admin = user!.role === 'admin';
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientQ, setClientQ] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [remise, setRemise] = useState<Remise>(ZERO);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [recu, setRecu] = useState(0);
  const [done, setDone] = useState<Vente | null>(null);

  const types = [...new Set(db.produits.map(p => p.type))].sort((a, b) => a.localeCompare(b, 'fr'));
  const tiles = useMemo(() => db.variantes.map(v => ({ v, p: db.produits.find(p => p.id === v.produitId)! })).filter(r => r.p)
    .filter(({ v, p }) => (!type || p.type === type) && (!q || norm([p.nom, v.coloris, v.sku, p.motif, p.origine].join(' ')).includes(norm(q))))
    .sort((a, b) => Number(b.v.stock > 0) - Number(a.v.stock > 0) || a.p.nom.localeCompare(b.p.nom, 'fr') || a.v.coloris.localeCompare(b.v.coloris, 'fr')), [db.variantes, db.produits, q, type]);

  const lignes = useMemo(() => buildLignes(db.produits, db.variantes, cart), [db.produits, db.variantes, cart]);
  const tot = useMemo(() => totaux(lignes, remise), [lignes, remise]);
  const inCart = (vid: string) => lignes.filter(l => l.varianteId === vid).reduce((s, l) => s + l.yards, 0);

  const add = (vid: string) => setCart(c => {
    const i = c.findIndex(x => x.varianteId === vid);
    if (i >= 0) return c.map((x, k) => (k === i ? { ...x, quantite: r2(x.quantite + 1) } : x));
    const v = db.variantes.find(x => x.id === vid)!;
    const p = db.produits.find(x => x.id === v.produitId)!;
    return [...c, { varianteId: vid, unite: p.vendPagne ? 'pagne' : 'yard', quantite: 1, remise: ZERO }];
  });
  const upd = (vid: string, patch: Partial<CartLine>) => setCart(c => c.map(x => (x.varianteId === vid ? { ...x, ...patch } : x)));

  const problems: string[] = [];
  lignes.forEach(l => {
    const v = db.variantes.find(x => x.id === l.varianteId)!;
    if (l.yards > v.stock) problems.push(t('err.stockInsuffisant', { nom: l.libelle, coloris: l.coloris, stock: num(v.stock) }));
  });
  if (!admin && tot.remiseEffPct > db.parametres.remiseMaxVendeur + 0.001) problems.push(t('err.remiseMax', { max: String(db.parametres.remiseMaxVendeur) }));
  if ((mode === 'flooz' || mode === 'tmoney') && cart.length > 0 && !reference.trim()) problems.push(t('err.reference'));
  if (mode === 'especes' && recu > 0 && recu < tot.total) problems.push(t('err.recuInsuffisant'));
  const cartOk = cart.length > 0 && cart.every(c => c.quantite > 0);
  const rendu = mode === 'especes' && recu >= tot.total && tot.total > 0 ? recu - tot.total : 0;

  const submit = () => {
    const r = validerVente({ cart, clientId: clientId || undefined, remise, mode, reference, recu });
    if (!r.ok) return toast(r.error!, 'err');
    setDone(r.data!);
    setCart([]); setRemise(ZERO); setClientId(''); setClientQ(''); setReference(''); setRecu(0); setMode('especes');
  };

  const clientOpts = db.clients.filter(c => !clientQ || norm(c.nom + ' ' + c.telephone).includes(norm(clientQ))).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return (
    <>
      <div className="page-head"><div><h1>{t('caisse.titre')}</h1><p className="muted-p">{t('caisse.sousTitre')}</p></div></div>
      <div className="pos">
        <section className="panel pos-catalog">
          <div className="filters">
            <div className="search"><LuSearch /><input className="input" placeholder={t('caisse.rechercher')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('caisse.rechercher')} /></div>
          </div>
          <div className="chips" role="group" aria-label={t('stock.type')}>
            <button className={cls('chip', !type && 'on')} onClick={() => setType('')}>{t('stock.tousTypes')}</button>
            {types.map(x => <button key={x} className={cls('chip', type === x && 'on')} onClick={() => setType(x)}>{x}</button>)}
          </div>
          <div className="tiles">
            {tiles.map(({ v, p }) => {
              const left = r2(v.stock - inCart(v.id));
              return (
                <button key={v.id} className="tile" disabled={v.stock <= 0} onClick={() => add(v.id)} aria-label={`${t('caisse.ajouter')} ${p.nom} ${v.coloris}`}>
                  <Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={56} />
                  <span className="tile-name">{p.nom}</span>
                  <span className="tile-col">{v.coloris}</span>
                  <span className="tile-price">{p.vendPagne ? `${fcfa(p.prixPagne)} / ${t('unite.pagne')}` : `${fcfa(p.prixYard)} / ${t('unite.yard')}`}</span>
                  <span className={cls('tile-stock', left <= v.seuil && 'low')}>{v.stock <= 0 ? t('stock.rupture') : `${num(left)} yd`}</span>
                </button>
              );
            })}
            {tiles.length === 0 && <p className="muted-p">{t('common.aucunResultat')}</p>}
          </div>
        </section>

        <aside className="panel cart" aria-label={t('caisse.panier')}>
          <div className="cart-scroll">
          <div className="panel-head"><h2>{t('caisse.panier')}</h2>{cart.length > 0 && <button className="link" onClick={() => setCart([])}>{t('caisse.vider')}</button>}</div>
          {cart.length === 0 ? <p className="muted-p cart-empty">{t('caisse.panierVide')}</p> : (
            <ul className="cart-lines">
              {cart.map(c => {
                const v = db.variantes.find(x => x.id === c.varianteId)!;
                const p = db.produits.find(x => x.id === v.produitId)!;
                const l = lignes.find(x => x.varianteId === c.varianteId)!;
                const over = l.yards > v.stock;
                return (
                  <li key={c.varianteId} className={over ? 'over' : ''}>
                    <div className="cl-top">
                      <Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={32} />
                      <div className="grow"><div className="strong">{p.nom}</div><div className="muted-s">{v.coloris}</div></div>
                      <button className="icon-btn danger" onClick={() => setCart(x => x.filter(y => y.varianteId !== c.varianteId))} aria-label={t('common.supprimer')}><LuTrash2 /></button>
                    </div>
                    <div className="cl-mid">
                      <NumInput stepper label={t('caisse.quantite')} value={c.quantite} onChange={n => upd(c.varianteId, { quantite: n })} />
                      {p.vendPagne && p.vendYard ? (
                        <select className="select" value={c.unite} onChange={e => upd(c.varianteId, { unite: e.target.value as UniteVente })} aria-label={t('stock.unite')}>
                          <option value="pagne">{uniteLabel('pagne', c.quantite)}</option><option value="yard">{uniteLabel('yard', c.quantite)}</option>
                        </select>
                      ) : <span className="muted-s">{uniteLabel(c.unite, c.quantite)}</span>}
                      <span className="cl-price">× {fcfa(l.prixUnitaire)}</span>
                    </div>
                    <div className="cl-bot">
                      <div className="disc">
                        <span className="muted-s">{t('caisse.remise')}</span>
                        <NumInput label={t('caisse.remise')} value={c.remise.valeur} onChange={n => upd(c.varianteId, { remise: { ...c.remise, valeur: n } })} className="sm" />
                        <select className="select sm" value={c.remise.type} onChange={e => upd(c.varianteId, { remise: { ...c.remise, type: e.target.value as Remise['type'] } })} aria-label={t('caisse.typeRemise')}><option value="pct">%</option><option value="fcfa">FCFA</option></select>
                      </div>
                      <strong>{fcfa(l.total)}</strong>
                    </div>
                    {over && <div className="error small">{t('caisse.stockDispo', { n: num(v.stock) })}</div>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="cart-sec">
            <div className="field-label">{t('caisse.client')}</div>
            <div className="client-pick">
              <input className="input" placeholder={t('caisse.chercherClient')} value={clientQ} onChange={e => setClientQ(e.target.value)} aria-label={t('caisse.chercherClient')} />
              <select className="select" value={clientId} onChange={e => setClientId(e.target.value)} aria-label={t('caisse.client')}>
                <option value="">{t('caisse.passage')}</option>
                {clientOpts.map(c => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` — ${c.telephone}` : ''}</option>)}
              </select>
              <button className="icon-btn" title={t('clients.nouveau')} aria-label={t('clients.nouveau')} onClick={() => setNewClient(true)}><LuUserPlus /></button>
            </div>
          </div>

          <div className="cart-sec">
            <div className="field-label">{t('caisse.remiseGlobale')}</div>
            <div className="disc wide">
              <NumInput label={t('caisse.remiseGlobale')} value={remise.valeur} onChange={n => setRemise({ ...remise, valeur: n })} />
              <Segmented label={t('caisse.typeRemise')} value={remise.type} onChange={v => setRemise({ ...remise, type: v })} options={[{ v: 'pct', label: '%' }, { v: 'fcfa', label: 'FCFA' }]} />
            </div>
            {!admin && <div className="hint">{t('caisse.remiseMaxHint', { max: String(db.parametres.remiseMaxVendeur) })}</div>}
          </div>


          <div className="cart-sec">
            <div className="field-label">{t('caisse.paiement')}</div>
            <div className="pay-modes" role="radiogroup" aria-label={t('caisse.paiement')}>
              {MODES.map(m => (
                <button key={m.v} type="button" role="radio" aria-checked={mode === m.v} className={cls('pay', mode === m.v && 'on')} onClick={() => setMode(m.v)}>{m.icon}<span>{t('pay.' + m.v)}</span></button>
              ))}
            </div>
            {(mode === 'flooz' || mode === 'tmoney') && (
              <label className="field"><span className="field-label">{t('caisse.reference')}</span><input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder={t('caisse.referenceEx')} /></label>
            )}
            {mode === 'especes' && (
              <div className="cash">
                <label className="field"><span className="field-label">{t('caisse.recu')}</span><NumInput label={t('caisse.recu')} value={recu} onChange={setRecu} step={1000} /></label>
                {rendu > 0 && <div className="rendu"><span>{t('ticket.rendu')}</span><strong>{fcfa(rendu)}</strong></div>}
              </div>
            )}
          </div>

          </div>
          <div className="cart-foot">
          <dl className="totals">
            <div><dt>{t('ticket.sousTotal')}</dt><dd>{fcfa(tot.sousTotal)}</dd></div>
            {tot.remiseMontant > 0 && <div><dt>{t('ticket.remise')}</dt><dd>−{fcfa(tot.remiseMontant)}</dd></div>}
            <div className="grand"><dt>{t('ticket.total')}</dt><dd>{fcfa(tot.total)}</dd></div>
            {admin && cart.length > 0 && <div className="muted-s"><dt>{t('caisse.marge')}</dt><dd>{fcfa(tot.marge)}</dd></div>}
          </dl>
          {problems.length > 0 && <ul className="problems" role="alert">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <button className="btn btn-primary btn-block btn-lg" disabled={!cartOk || problems.length > 0} onClick={submit}><LuCheck /> {t('caisse.valider')} {tot.total > 0 && `· ${fcfa(tot.total)}`}</button>
          </div>
        </aside>
      </div>

      {newClient && <ClientForm onClose={() => setNewClient(false)} onSaved={c => { setClientId(c.id); setClientQ(''); }} />}
      {done && (
        <TicketModal vente={done} title={t('caisse.venteValidee', { n: numeroVente(done.numero) })} onClose={() => setDone(null)}>
          <button className="btn" onClick={() => setDone(null)}><LuPlus /> {t('caisse.nouvelleVente')}</button>
        </TicketModal>
      )}
    </>
  );
}
