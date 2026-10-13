import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowDown, LuBanknote, LuCheck, LuCreditCard, LuPlus, LuSearch, LuShoppingBag, LuGift, LuSmartphone, LuTag, LuTrash2, LuUserPlus } from 'react-icons/lu';
import type { CartLine, ModePaiement, Produit, Promotion, Remise, UniteVente, Variante, Vente } from '../types';
import { useApp } from '../store';
import { t, uniteLabel } from '../i18n';
import { Badge, Bump, Empty, NumInput, Segmented, Swatch, animateOut, reducedMotion, useUI } from '../components/ui';
import { TicketModal } from '../components/TicketModal';
import { ClientForm } from '../components/ClientForm';
import { buildLignes, enCours, minimumNonAtteint, pagneSeul, pointsGagnes, pointsMax, prixUnitaire, refusPoints, remisePoints, totaux, unitesVendables, vise } from '../lib/calc';
import { cls, fcfa, norm, num, numeroVente, r2 } from '../lib/format';

/** « −10 % », « −2 000 / pagne », avec le seuil éventuel (« dès 3 »). */
const libellePromo = (pr: Promotion) =>
  (pr.typeRemise === 'pct' ? `−${num(pr.valeur)} %` : `−${fcfa(pr.valeur)}`) + (pr.quantiteMin > 0 ? ` ${t('promo.des', { n: num(pr.quantiteMin) })}` : '');

const MODES: { v: ModePaiement; icon: React.ReactNode }[] = [
  { v: 'especes', icon: <LuBanknote /> }, { v: 'flooz', icon: <LuSmartphone /> }, { v: 'tmoney', icon: <LuSmartphone /> }, { v: 'carte', icon: <LuCreditCard /> },
];
const ZERO: Remise = { type: 'pct', valeur: 0 };

export default function Caisse() {
  const { db, user, shopMode, validerVente } = useApp();
  const { toast } = useUI();
  const admin = user!.role === 'admin' || user!.role === 'boutique_admin' || (user!.role === 'tenant_admin' && shopMode);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [proprio, setProprio] = useState(''); // option « plusieurs propriétaires » : '' = tous
  const multi = db.parametres.multiProprietaires && db.proprietaires.length > 0;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState('');
  const [points, setPoints] = useState(0); // points de fidélité que le client veut utiliser
  const [clientQ, setClientQ] = useState('');
  const [newClient, setNewClient] = useState(false);
  const [remise, setRemise] = useState<Remise>(ZERO);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [recu, setRecu] = useState(0);
  const [done, setDone] = useState<Vente | null>(null);
  const [busy, setBusy] = useState(false);

  const types = [...new Set(db.produits.map(p => p.type))].sort((a, b) => a.localeCompare(b, 'fr'));
  const tiles = useMemo(() => db.variantes.map(v => ({ v, p: db.produits.find(p => p.id === v.produitId)! })).filter(r => r.p)
    .filter(({ v, p }) => (!type || p.type === type) && (!multi || !proprio || p.proprietaireId === proprio) && (!q || norm([p.nom, v.coloris, v.sku, p.motif, p.origine].join(' ')).includes(norm(q))))
    .sort((a, b) => Number(b.v.stock > 0) - Number(a.v.stock > 0) || a.p.nom.localeCompare(b.p.nom, 'fr') || a.v.coloris.localeCompare(b.v.coloris, 'fr')), [db.variantes, db.produits, q, type, proprio, multi]);

  const params = db.parametres;
  const uniteStock = params.uniteStock;
  const lignes = useMemo(() => buildLignes(db.produits, db.variantes, cart, uniteStock, db.promotions), [db.produits, db.variantes, cart, uniteStock, db.promotions]);
  // Promotion affichée sur une tuile : en cours et visant ce coloris dans l'unité proposée (le seuil éventuel est indiqué).
  const promoTuile = (p: Produit, v: Variante, unite?: UniteVente) => (unite ? db.promotions.find(pr => enCours(pr) && vise(pr, p, v, unite)) : undefined);
  const tot = useMemo(() => totaux(lignes, remise), [lignes, remise]);
  const inCart = (vid: string) => lignes.filter(l => l.varianteId === vid).reduce((s, l) => s + l.quantiteStock, 0);

  const add = (vid: string) => setCart(c => {
    const i = c.findIndex(x => x.varianteId === vid);
    if (i >= 0) return c.map((x, k) => (k === i ? { ...x, quantite: r2(x.quantite + 1) } : x));
    const v = db.variantes.find(x => x.id === vid)!;
    const p = db.produits.find(x => x.id === v.produitId)!;
    const [unite] = unitesVendables(p, params);
    return unite ? [...c, { varianteId: vid, unite, quantite: 1, remise: ZERO }] : c;
  });
  const upd = (vid: string, patch: Partial<CartLine>) => setCart(c => c.map(x => (x.varianteId === vid ? { ...x, ...patch } : x)));

  const problems: string[] = [];
  if (minimumNonAtteint(params, cart)) problems.push(t('err.quantiteMinPanier', { n: num(params.quantiteMinPanier) }));
  lignes.forEach(l => {
    const v = db.variantes.find(x => x.id === l.varianteId)!;
    if (l.quantiteStock > v.stock) problems.push(t('err.stockInsuffisant', { nom: l.libelle, coloris: l.coloris, stock: num(v.stock), unite: uniteLabel(uniteStock, v.stock) }));
  });
  if (!admin && tot.remiseEffPct > db.parametres.remiseMaxVendeur + 0.001) problems.push(t('err.remiseMax', { max: String(db.parametres.remiseMaxVendeur) }));
  // Fidélité : les points se déduisent après toutes les remises ; le client gagne des points sur ce qu'il paie.
  const fidelite = params.fideliteActive;
  const client = db.clients.find(c => c.id === clientId);
  const pts = fidelite && client ? points : 0;
  const remPts = remisePoints(params, pts);
  const aPayer = tot.total - remPts;
  const gagnes = client ? pointsGagnes(params, aPayer) : 0;
  const refus = refusPoints(params, client, pts, tot.total);
  if (refus) problems.push(t(refus.cle, refus.vars));

  if ((mode === 'flooz' || mode === 'tmoney') && cart.length > 0 && !reference.trim()) problems.push(t('err.reference'));
  if (mode === 'especes' && recu > 0 && recu < aPayer) problems.push(t('err.recuInsuffisant'));
  const cartOk = cart.length > 0 && cart.every(c => c.quantite > 0);
  const rendu = mode === 'especes' && recu >= aPayer && aPayer > 0 ? recu - aPayer : 0;

  const submit = async () => {
    if (busy) return; // une seule vente à la fois : un double clic ne doit jamais créer deux ventes
    setBusy(true);
    const r = await validerVente({ cart, clientId: clientId || undefined, remise, mode, reference, recu, pointsUtilises: pts });
    setBusy(false);
    if (!r.ok) return toast(r.error!, 'err');
    setDone(r.data!);
    setCart([]); setRemise(ZERO); setClientId(''); setClientQ(''); setReference(''); setRecu(0); setMode('especes'); setPoints(0);
  };

  const clientOpts = db.clients.filter(c => !clientQ || norm(c.nom + ' ' + c.telephone).includes(norm(clientQ))).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  // Présentation uniquement : sur téléphone, une barre flottante résume le panier tant qu'il n'est pas à l'écran.
  const cartRef = useRef<HTMLElement>(null);
  const [cartInView, setCartInView] = useState(false);
  useEffect(() => {
    const el = cartRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCartInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const showCart = () => cartRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const qtyInCart = (vid: string) => cart.find(c => c.varianteId === vid);

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
          {multi && (
            <div className="chips" role="group" aria-label={t('prop.proprietaire')}>
              <button className={cls('chip', !proprio && 'on')} onClick={() => setProprio('')}>{t('prop.tous')}</button>
              {db.proprietaires.filter(o => o.actif).map(o => <button key={o.id} className={cls('chip', proprio === o.id && 'on')} onClick={() => setProprio(o.id)}>{o.nom}</button>)}
            </div>
          )}
          <div className="tiles">
            {tiles.map(({ v, p }, i) => {
              const left = r2(v.stock - inCart(v.id));
              const [unite] = unitesVendables(p, params);
              const line = qtyInCart(v.id);
              const promo = promoTuile(p, v, unite);
              return (
                <button key={v.id} className={cls('tile', line && 'in-cart')} style={{ ['--i' as string]: Math.min(i, 18) } as React.CSSProperties} disabled={v.stock <= 0 || !unite} onClick={() => add(v.id)} aria-label={`${t('caisse.ajouter')} ${p.nom} ${v.coloris}`}>
                  <Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={56} />
                  {line && <Bump value={line.quantite} className="tile-qty">{num(line.quantite)}</Bump>}
                  {promo && <span className="tile-promo" title={promo.nom}>{libellePromo(promo)}</span>}
                  <span className="tile-name">{p.nom}</span>
                  <span className="tile-col">{v.coloris}</span>
                  <span className="tile-meta">
                    <span className="tile-price">{unite ? <>{fcfa(prixUnitaire(p, unite))} <small>/ {t('unite.' + unite)}</small></> : '—'}</span>
                    <span className={cls('tile-stock', left <= v.seuil && 'low')}>{v.stock <= 0 ? t('stock.rupture') : `${num(left)} ${uniteLabel(uniteStock, left)}`}</span>
                  </span>
                </button>
              );
            })}
            {tiles.length === 0 && <div className="tiles-empty"><Empty title={t('common.aucunResultat')} /></div>}
          </div>
        </section>

        <aside className="panel cart" aria-label={t('caisse.panier')} ref={cartRef}>
          <div className="cart-scroll">
          <div className="panel-head">
            <h2>{t('caisse.panier')}{cart.length > 0 && <Bump value={cart.length} className="cart-count">{cart.length}</Bump>}</h2>
            {cart.length > 0 && <button className="link" onClick={() => setCart([])}>{t('caisse.vider')}</button>}
          </div>
          {pagneSeul(params) && params.quantiteMinPanier > 1 && <p className="hint cart-hint">{t('caisse.minimumHint', { n: num(params.quantiteMinPanier) })}</p>}
          {cart.length === 0 ? <div className="cart-empty"><span className="empty-mark" aria-hidden="true" /><p>{t('caisse.panierVide')}</p></div> : (
            <ul className="cart-lines">
              {cart.map(c => {
                const v = db.variantes.find(x => x.id === c.varianteId)!;
                const p = db.produits.find(x => x.id === v.produitId)!;
                const l = lignes.find(x => x.varianteId === c.varianteId)!;
                const over = l.quantiteStock > v.stock;
                const unites = unitesVendables(p, params);
                return (
                  <li key={c.varianteId} className={over ? 'over' : ''}>
                    <div className="cl-top">
                      <Swatch c1={v.c1} c2={v.c2} seed={p.id} image={p.image} size={32} />
                      <div className="grow"><div className="strong">{p.nom}</div><div className="muted-s">{v.coloris}</div></div>
                      <button className="icon-btn danger" onClick={e => animateOut(e.currentTarget.closest('li'), () => setCart(x => x.filter(y => y.varianteId !== c.varianteId)))} aria-label={t('common.supprimer')}><LuTrash2 /></button>
                    </div>
                    <div className="cl-mid">
                      <NumInput stepper label={t('caisse.quantite')} value={c.quantite} onChange={n => upd(c.varianteId, { quantite: n })} />
                      {unites.length > 1 ? (
                        <select className="select" value={c.unite} onChange={e => upd(c.varianteId, { unite: e.target.value as UniteVente })} aria-label={t('stock.unite')}>
                          {unites.map(u => <option key={u} value={u}>{uniteLabel(u, c.quantite)}</option>)}
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
                      <strong>{l.total < l.brut && <s className="muted-s">{fcfa(l.brut)}</s>} {fcfa(l.total)}</strong>
                    </div>
                    {l.remisePromo > 0 && <div className="cl-promo"><LuTag /> {l.promotionLibelle} <span>−{fcfa(l.remisePromo)}</span></div>}
                    {over && <div className="error small">{t('caisse.stockDispo', { n: num(v.stock), unite: uniteLabel(uniteStock, v.stock) })}</div>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="cart-sec">
            <div className="field-label">{t('caisse.client')}</div>
            <div className="client-pick">
              <input className="input" placeholder={t('caisse.chercherClient')} value={clientQ} onChange={e => setClientQ(e.target.value)} aria-label={t('caisse.chercherClient')} />
              <select className="select" value={clientId} onChange={e => { setClientId(e.target.value); setPoints(0); }} aria-label={t('caisse.client')}>
                <option value="">{t('caisse.passage')}</option>
                {clientOpts.map(c => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` — ${c.telephone}` : ''}</option>)}
              </select>
              <button className="icon-btn" title={t('clients.nouveau')} aria-label={t('clients.nouveau')} onClick={() => setNewClient(true)}><LuUserPlus /></button>
            </div>
            {fidelite && client && (
              <div className="fid-box">
                <div className="fid-solde">
                  <LuGift />
                  <strong className={cls(client.points < 0 && 'red')}>{t('fid.solde', { n: num(client.points) })}</strong>
                  {client.points > 0 && <span className="muted-s">{t('fid.soldeValeur', { v: fcfa(remisePoints(params, client.points)) })}</span>}
                </div>
                {client.points >= params.fideliteSeuil && client.points > 0 ? (
                  <div className="fid-use">
                    <span className="muted-s">{t('fid.utiliser')}</span>
                    <NumInput label={t('fid.utiliser')} value={points} onChange={n => setPoints(Math.max(0, Math.floor(n)))} step={params.fideliteSeuil || 10} className="sm" />
                    <button type="button" className="btn btn-sm" onClick={() => setPoints(pointsMax(params, client.points, tot.total))}>{t('fid.max')}</button>
                  </div>
                ) : <span className="hint">{t('fid.dispo', { n: num(params.fideliteSeuil) })}</span>}
              </div>
            )}
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
            {tot.promotions > 0 && <div className="promo-total"><dt>{t('caisse.dontPromotions')}</dt><dd>−{fcfa(tot.promotions)}</dd></div>}
            <div><dt>{t('ticket.sousTotal')}</dt><dd>{fcfa(tot.sousTotal)}</dd></div>
            {tot.remiseMontant > 0 && <div><dt>{t('ticket.remise')}</dt><dd>−{fcfa(tot.remiseMontant)}</dd></div>}
            {remPts > 0 && <div className="fid-total"><dt>{t('fid.remise')} ({num(pts)})</dt><dd>−{fcfa(remPts)}</dd></div>}
            <div className="grand"><dt>{t('ticket.total')}</dt><dd>{fcfa(aPayer)}</dd></div>
            {admin && cart.length > 0 && <div className="muted-s"><dt>{t('caisse.marge')}</dt><dd>{fcfa(tot.marge - remPts)}</dd></div>}
          </dl>
          {gagnes > 0 && cart.length > 0 && <p className="hint fid-gain"><LuGift /> {t('fid.gagnera', { n: num(gagnes) })}</p>}
          {problems.length > 0 && <ul className="problems" role="alert">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <button className="btn btn-primary btn-block btn-lg" disabled={!cartOk || problems.length > 0 || busy} onClick={submit}><LuCheck /> {t('caisse.valider')} {aPayer > 0 && `· ${fcfa(aPayer)}`}</button>
          </div>
        </aside>
      </div>

      {/* Téléphone : résumé flottant du panier tant que celui-ci est hors de l'écran (masqué au-delà de 700 px par la CSS). */}
      <button type="button" className="cart-bar" hidden={cart.length === 0 || cartInView} onClick={showCart} aria-label={`${t('caisse.voirPanier')} · ${t('caisse.nbArticles', { n: String(cart.length) })} · ${fcfa(aPayer)}`}>
        <Bump value={cart.length} className="cart-bar-icon"><LuShoppingBag aria-hidden="true" /><span className="cart-bar-n">{cart.length}</span></Bump>
        <span className="cart-bar-info"><span>{t('caisse.nbArticles', { n: String(cart.length) })}</span><strong>{fcfa(aPayer)}</strong></span>
        <span className="cart-bar-go">{t('caisse.voirPanier')} <LuArrowDown aria-hidden="true" /></span>
      </button>

      {newClient && <ClientForm onClose={() => setNewClient(false)} onSaved={c => { setClientId(c.id); setClientQ(''); }} />}
      {done && (
        <TicketModal vente={done} title={t('caisse.venteValidee', { n: numeroVente(done.numero) })} onClose={() => setDone(null)}
          lead={
            <div className="sale-ok" role="status">
              <svg className="sale-ok-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="26" /><path d="M15 27.5l7.5 7.5L38 19" pathLength={1} /></svg>
              <div>
                <div className="sale-ok-amount">{fcfa(done.total)}</div>
                <div className="sale-ok-sub">
                  {t('caisse.venteEnregistree')} · {t('pay.' + done.paiement.mode)}
                  {done.paiement.mode === 'especes' && (done.paiement.recu ?? 0) > done.total && <> · {t('ticket.rendu')} <strong>{fcfa((done.paiement.recu ?? 0) - done.total)}</strong></>}
                </div>
              </div>
            </div>
          }>
          <button className="btn" onClick={() => setDone(null)}><LuPlus /> {t('caisse.nouvelleVente')}</button>
        </TicketModal>
      )}
    </>
  );
}
