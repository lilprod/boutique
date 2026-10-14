import React, { useEffect, useState } from 'react';
import {
  LuArrowRight, LuBadgeCheck, LuBuilding2, LuCalendarClock, LuCircleAlert, LuCircleCheck, LuDownload, LuFileText, LuHourglass,
  LuLayers, LuPaperclip, LuPlus, LuReceipt, LuStore, LuTrendingUp, LuTriangleAlert, LuUsers, LuWallet, LuX,
} from 'react-icons/lu';
import { get, getAll, getBlob, post, put } from '../api';
import { useApp } from '../store';
import { t } from '../i18n';
import { Link, useRoute } from '../router';
import { CountUp, Empty, Skeleton, SkeletonRows, reducedMotion } from '../components/ui';
import { cls, fcfa, fmtDate, hash } from '../lib/format';

interface TenantRow {
  id: number;
  nom: string;
  slug?: string;
  statut?: string;
  boutiques?: Array<{ id: number; nom: string }>;
  subscription?: { id?: number; status?: string; ends_at?: string; plan?: { id?: number; nom?: string; prix?: number; intervalle?: string } } | null;
  licenses?: Array<{ id: number; status?: string; expires_at?: string }>;
}

interface DashboardResponse {
  totals: {
    total_tenants?: number;
    active_tenants?: number;
    total_boutiques?: number;
    active_subscriptions?: number;
    trial_subscriptions?: number;
    expired_licenses?: number;
    expiring_licenses?: number;
    mrr?: number;
  };
  tenants: TenantRow[];
  plans: Array<{ id: number; nom: string; prix?: number; intervalle?: string; max_boutiques?: number; max_utilisateurs?: number; actif?: boolean }>;
}

interface PaymentSummary {
  id: number;
  tenant?: { id: number; nom: string; slug?: string } | null;
  plan?: { id: number; nom: string } | null;
  amount: number;
  status: 'paid' | 'unpaid' | 'rejected' | 'pending';
  payment_method?: string;
  payment_reference?: string;
  notes?: string | null;
  created_at?: string;
  invoice_number?: string | null;
  attachment_name?: string | null;
  has_attachment?: boolean;
}

interface PaymentReport {
  totals: {
    paid?: number;
    unpaid?: number;
    rejected?: number;
    pending?: number;
    paid_amount?: number;
  };
  transactions: PaymentSummary[];
}

/* ---------- Présentation ---------- */
type Tone = 'ok' | 'trial' | 'warn' | 'bad' | 'mute';
/** Couleur du badge selon le statut renvoyé par l'API (abonnement, licence, paiement ou compte). */
const toneOf = (s?: string | null): Tone => {
  switch (s) {
    case 'active': case 'paid': return 'ok';
    case 'trial': return 'trial';
    case 'pending': case 'unpaid': return 'warn';
    case 'expired': case 'rejected': case 'cancelled': case 'suspended': return 'bad';
    default: return 'mute';
  }
};
const StatusBadge = ({ status }: { status?: string | null }) => <span className={cls('badge', toneOf(status))}>{t(`billing.status.${status ?? 'none'}`)}</span>;

function Avatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return <span className={`avatar a${hash(name) % 4}`} aria-hidden="true">{initials}</span>;
}

type StatTone = 'brand' | 'gold' | 'green' | 'terra' | 'danger' | 'mute';
function Stat({ icon, label, value, format, hint, tone = 'brand', i = 0 }: { icon: React.ReactNode; label: string; value: number; format?: (n: number) => string; hint?: React.ReactNode; tone?: StatTone; i?: number }) {
  return (
    <div className={cls('stat', tone)} style={{ ['--i' as string]: i } as React.CSSProperties}>
      <div className="stat-top"><span className="stat-l">{label}</span><span className="stat-icon" aria-hidden="true">{icon}</span></div>
      <span className="stat-v"><CountUp value={value} format={format} /></span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/** « 1 boutique » / « 3 boutiques » : clés `base.1` et `base.n` du dictionnaire. */
const pl = (n: number, base: string) => t(`${base}.${n > 1 ? 'n' : '1'}`, { n: String(n) });

/** Modes d'encaissement acceptés par l'API (le mode « manual » des anciennes données n'est plus proposé). */
const MODES = [
  { v: 'cash', label: 'billing.method.cash', ref: 'sa.ref.cash' },
  { v: 'card', label: 'sa.mode.card', ref: 'sa.ref.card' },
  { v: 'tmoney', label: 'billing.method.tmoney', ref: 'sa.ref.tmoney' },
  { v: 'flooz', label: 'billing.method.flooz', ref: 'sa.ref.flooz' },
] as const;

/** Date de fin après renouvellement, calculée comme l'API : depuis la fin en cours si elle n'est pas passée. */
function finApresRenouvellement(finActuelle: string | undefined, periodes: number, intervalle?: string): Date {
  const now = new Date();
  const debut = finActuelle && new Date(finActuelle) > now ? new Date(finActuelle) : now;
  const fin = new Date(debut);
  if (intervalle === 'year') fin.setFullYear(fin.getFullYear() + periodes);
  else fin.setMonth(fin.getMonth() + periodes);
  return fin;
}

const VIEWS = {
  overview: {
    eyebrow: 'sa.v.overview.eyebrow', title: 'sa.v.overview.title', sub: 'sa.v.overview.sub',
  },
  tenants: {
    eyebrow: 'sa.v.tenants.eyebrow', title: 'sa.v.tenants.title', sub: 'sa.v.tenants.sub',
  },
  payments: {
    eyebrow: 'sa.v.payments.eyebrow', title: 'sa.v.payments.title', sub: 'sa.v.payments.sub',
  },
  plans: {
    eyebrow: 'sa.v.plans.eyebrow', title: 'sa.v.plans.title', sub: 'sa.v.plans.sub',
  },
} as const;

export default function SuperAdminDashboard() {
  const { user } = useApp();
  const path = useRoute();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [paymentTenants, setPaymentTenants] = useState<TenantRow[]>([]);
  const [payments, setPayments] = useState<PaymentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [planForm, setPlanForm] = useState({
    nom: '', slug: '', prix: '0', intervalle: 'month', max_boutiques: '1', max_utilisateurs: '5', features: 'stock,ventes,users', actif: true,
  });
  const [tenantForm, setTenantForm] = useState({
    nom: '', slug: '', boutiqueNom: '', boutiqueAdresse: '', boutiqueTelephone: '', planId: '', paymentMethod: 'cash', paymentReference: '',
  });
  const PAIEMENT_VIDE = { tenantId: '', planId: '', periodes: '1', amount: '', amountAuto: true, prolonger: true, method: 'cash', reference: '', status: 'paid', notes: '' };
  const [paymentForm, setPaymentForm] = useState(PAIEMENT_VIDE);
  const [paymentAttachment, setPaymentAttachment] = useState<File | null>(null);

  const reload = async () => {
    try {
      setLoading(true);
      const [dashboard, billing, tenants] = await Promise.all([
        get<DashboardResponse>('/super-admin/dashboard'),
        get<PaymentReport>('/super-admin/payments'),
        getAll<TenantRow>('/super-admin/tenants'),
      ]);
      setData(dashboard);
      setPayments(billing);
      setPaymentTenants(tenants);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? t('sa.err.chargement'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await post('/super-admin/plans', {
        nom: planForm.nom.trim(),
        slug: planForm.slug.trim(),
        prix: Number(planForm.prix),
        intervalle: planForm.intervalle,
        max_boutiques: Number(planForm.max_boutiques),
        max_utilisateurs: Number(planForm.max_utilisateurs),
        features: planForm.features.split(',').map(item => item.trim()).filter(Boolean),
        actif: planForm.actif,
      });
      setStatus({ type: 'ok', msg: t('sa.ok.formule') });
      setPlanForm({ ...planForm, nom: '', slug: '', prix: '0', max_boutiques: '1', max_utilisateurs: '5', features: 'stock,ventes,users' });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? t('sa.err.formule') });
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tenant = await post<{ tenant: { id: number } }>('/super-admin/tenants', {
        nom: tenantForm.nom.trim(),
        slug: tenantForm.slug.trim(),
        boutique: {
          nom: tenantForm.boutiqueNom.trim(),
          adresse: tenantForm.boutiqueAdresse.trim() || null,
          telephone: tenantForm.boutiqueTelephone.trim() || null,
        },
      });

      if (tenantForm.planId && tenant?.tenant?.id) {
        await post(`/super-admin/tenants/${tenant.tenant.id}/subscribe`, {
          plan_id: Number(tenantForm.planId),
          status: 'active',
          payment_method: tenantForm.paymentMethod,
          payment_reference: tenantForm.paymentReference,
        });
      }

      setStatus({ type: 'ok', msg: t('sa.ok.entreprise') });
      setTenantForm({ nom: '', slug: '', boutiqueNom: '', boutiqueAdresse: '', boutiqueTelephone: '', planId: '', paymentMethod: 'cash', paymentReference: '' });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? t('sa.err.entreprise') });
    }
  };

  const handleStatusChange = async (tenantId: number, nextStatus: 'active' | 'trial' | 'expired' | 'cancelled') => {
    try {
      await put(`/super-admin/tenants/${tenantId}/subscription-status`, {
        status: nextStatus,
        license_status: nextStatus === 'cancelled' ? 'suspended' : nextStatus === 'expired' ? 'expired' : 'active',
      });
      setStatus({ type: 'ok', msg: t('sa.ok.statut', { statut: t(`billing.status.${nextStatus}`) }) });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? t('sa.err.statut') });
    }
  };

  /* Encaissement : un paiement reçu prolonge abonnement et licence (route /renouvellements) ;
     décoché, il est seulement enregistré, par exemple une référence en attente de vérification. */
  const tenantChoisi = paymentTenants.find(x => String(x.id) === paymentForm.tenantId);
  const planChoisi = data?.plans.find(p => String(p.id) === paymentForm.planId);
  const periodes = Math.max(1, Number(paymentForm.periodes) || 1);
  const montant = paymentForm.prolonger && paymentForm.amountAuto ? String((planChoisi?.prix ?? 0) * periodes) : paymentForm.amount;
  const licenceChoisie = tenantChoisi?.licenses?.find(x => x.status === 'active') ?? tenantChoisi?.licenses?.[0];
  const nouvelleFin = paymentForm.prolonger && planChoisi
    ? finApresRenouvellement(licenceChoisie?.expires_at ?? tenantChoisi?.subscription?.ends_at, periodes, planChoisi.intervalle)
    : null;

  const choisirTenant = (id: string) => {
    const tn = paymentTenants.find(x => String(x.id) === id);
    setPaymentForm(f => ({ ...f, tenantId: id, planId: tn?.subscription?.plan?.id ? String(tn.subscription.plan.id) : f.planId }));
  };
  const renouvelerDepuisListe = (id: number) => {
    choisirTenant(String(id));
    setPaymentForm(f => ({ ...f, prolonger: true }));
    window.location.hash = '#/paiements';
  };

  const handleCreatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentForm.tenantId) return;

    const form = new FormData();
    form.set('amount', montant);
    form.set('payment_method', paymentForm.method);
    form.set('payment_reference', paymentForm.reference.trim());
    form.set('notes', paymentForm.notes.trim());
    if (paymentForm.prolonger) {
      form.set('plan_id', paymentForm.planId);
      form.set('periodes', String(periodes));
    } else {
      form.set('status', paymentForm.status);
    }
    if (paymentAttachment) form.set('attachment', paymentAttachment);

    try {
      if (paymentForm.prolonger) {
        await post(`/super-admin/tenants/${paymentForm.tenantId}/renouvellements`, form);
        setStatus({ type: 'ok', msg: nouvelleFin ? t('sa.ok.renouvele', { nom: tenantChoisi?.nom ?? t('sa.lEntreprise'), d: fmtDate(nouvelleFin.toISOString()) }) : t('sa.ok.renouveleSansDate', { nom: tenantChoisi?.nom ?? t('sa.lEntreprise') }) });
      } else {
        await post(`/super-admin/tenants/${paymentForm.tenantId}/payments`, form);
        setStatus({ type: 'ok', msg: t('sa.ok.paiement') });
      }
      setPaymentForm(PAIEMENT_VIDE);
      setPaymentAttachment(null);
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? t('sa.err.paiement') });
    }
  };

  const downloadBlob = async (path: string, filename: string) => {
    try {
      const blob = await getBlob(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? t('sa.err.telechargement') });
    }
  };

  /** Présentation : amène un formulaire à l'écran (utile sur téléphone, où il est sous la liste) et place le curseur dans son premier champ. */
  const focusForm = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
  };

  const view = path === '/tenants' ? 'tenants' : path === '/plans' ? 'plans' : path === '/paiements' ? 'payments' : 'overview';
  const head = VIEWS[view];

  const pageHead = (actions?: React.ReactNode) => (
    <div className="page-head">
      <div>
        <span className="eyebrow">{t(head.eyebrow)}</span>
        <h1>{t(head.title)}</h1>
        <p className="muted-p page-sub">{t(head.sub)}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );

  if (loading && !data) {
    return (
      <>
        {pageHead()}
        <div className="stat-grid" role="status" aria-live="polite">
          <span className="sr-only">{t('app.chargement')}</span>
          {[0, 1, 2, 3].map(i => <div key={i} className="stat mute"><Skeleton w="60%" h={12} /><Skeleton w="45%" h={28} /><Skeleton w="70%" h={10} /></div>)}
        </div>
        <section className="panel"><SkeletonRows label={t('app.chargement')} /></section>
      </>
    );
  }
  if (error) {
    return (
      <>
        {pageHead()}
        <div className="panel state-box" role="alert">
          <span className="state-icon bad"><LuCircleAlert /></span>
          <div className="grow"><h2>{t('sa.err.titre')}</h2><p className="muted-p">{error}</p></div>
          <button className="btn" onClick={() => void reload()}>{t('common.reessayer')}</button>
        </div>
      </>
    );
  }
  if (!data) return <>{pageHead()}<div className="panel"><Empty title={t('sa.aucunIndicateur')} /></div></>;

  const tt = data.totals;
  const pt = payments?.totals ?? {};
  const toWatch = (tt.expiring_licenses ?? 0) + (tt.expired_licenses ?? 0);
  const payCount = (pt.paid ?? 0) + (pt.unpaid ?? 0) + (pt.pending ?? 0) + (pt.rejected ?? 0);
  const pct = (n?: number) => (payCount ? ((n ?? 0) / payCount) * 100 : 0);
  const transactions = payments?.transactions ?? [];

  const notice = status && (
    <div className={cls('notice', status.type)} role={status.type === 'err' ? 'alert' : 'status'} key={status.msg}>
      {status.type === 'ok' ? <LuCircleCheck /> : <LuTriangleAlert />}
      <p>{status.msg}</p>
      <button type="button" className="icon-btn" onClick={() => setStatus(null)} aria-label={t('common.fermer')}><LuX /></button>
    </div>
  );

  const docButtons = (payment: PaymentSummary) => (
    <div className="row-actions">
      {/* Icônes seules : le tableau des paiements a déjà 7 colonnes à côté du formulaire. */}
      <button className="icon-btn" type="button" onClick={() => void downloadBlob(`/super-admin/payments/${payment.id}/invoice`, `${payment.invoice_number ?? `facture-${payment.id}`}.html`)} title={t('sa.dl.facture')} aria-label={t('sa.dl.factureCourt')}>
        <LuFileText />
      </button>
      {payment.has_attachment && <button className="icon-btn" type="button" onClick={() => void downloadBlob(`/super-admin/payments/${payment.id}/attachment`, payment.attachment_name ?? `justificatif-${payment.id}`)} title={t('sa.dl.justif')} aria-label={t('sa.dl.justifCourt')}><LuPaperclip /></button>}
    </div>
  );

  const paymentsTable = (rows: PaymentSummary[], compact = false) => (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>
          {!compact && <th>{t('tp.col.date')}</th>}<th>{t('sa.col.entreprise')}</th>{!compact && <th>{t('tp.col.formule')}</th>}<th className="r">{t('tp.col.montant')}</th><th>{t('tp.col.moyen')}</th><th>{t('tp.col.statut')}</th>{!compact && <th>{t('tp.col.documents')}</th>}
        </tr></thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id}>
              {!compact && <td className="nowrap">{payment.created_at ? fmtDate(payment.created_at) : '—'}</td>}
              <td>
                <div className="strong">{payment.tenant?.nom ?? '—'}</div>
                {payment.invoice_number && <div className="muted-s mono">{payment.invoice_number}</div>}
              </td>
              {!compact && <td>{payment.plan?.nom ?? '—'}</td>}
              <td className="r strong nowrap">{fcfa(payment.amount)}</td>
              <td><div>{t(`billing.method.${payment.payment_method ?? 'manual'}`)}</div>{payment.payment_reference && <div className="muted-s mono">{payment.payment_reference}</div>}</td>
              <td><StatusBadge status={payment.status} /></td>
              {!compact && <td>{docButtons(payment)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="view" key={view}>
      {view === 'overview' && (
        <>
          {pageHead(<>
            <Link to="/paiements" className="btn"><LuWallet /> {t('sa.encaisser')}</Link>
            <Link to="/tenants" className="btn btn-primary"><LuPlus /> {t('sa.inscrire')}</Link>
          </>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuBuilding2 />} label={t('sa.stat.entreprises')} value={tt.total_tenants ?? 0} hint={pl(tt.active_tenants ?? 0, 'sa.activesPlateforme')} />
            <Stat i={1} tone="green" icon={<LuStore />} label={t('sa.stat.boutiques')} value={tt.total_boutiques ?? 0} hint={t('sa.stat.boutiquesHint')} />
            <Stat i={2} tone="gold" icon={<LuBadgeCheck />} label={t('sa.stat.abonnements')} value={tt.active_subscriptions ?? 0} hint={t('sa.stat.plusEssai', { n: String(tt.trial_subscriptions ?? 0) })} />
            <Stat i={3} tone="terra" icon={<LuTrendingUp />} label={t('sa.stat.mrr')} value={tt.mrr ?? 0} format={fcfa} hint={t('sa.stat.mrrHint')} />
          </div>

          <div className="sa-grid">
            <section className="panel">
              <div className="panel-head">
                <div><h2>{t('sa.dernieres')}</h2><p className="panel-sub">{t('sa.dernieresSous')}</p></div>
                <Link to="/tenants" className="link">{t('sa.toutes')} <LuArrowRight className="link-arrow" /></Link>
              </div>
              {data.tenants.length === 0 ? (
                <Empty title={t('sa.aucuneEntreprise')}>
                  <Link to="/tenants" className="btn btn-sm btn-primary"><LuPlus /> {t('sa.inscrirePremiere')}</Link>
                </Empty>
              ) : (
                <ul className="entity-list">
                  {data.tenants.slice(0, 6).map((tenant) => (
                    <li key={tenant.id}>
                      <Avatar name={tenant.nom} />
                      <div className="grow">
                        <div className="strong ellipsis">{tenant.nom}</div>
                        <div className="muted-s">{tenant.subscription?.plan?.nom ?? t('sa.sansFormule')} · {pl(tenant.boutiques?.length ?? 0, 'sa.boutiques')}</div>
                      </div>
                      <StatusBadge status={tenant.statut} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div><h2>{t('sa.surveiller')}</h2><p className="panel-sub">{t('sa.surveillerSous')}</p></div>
                {toWatch > 0 ? <span className="badge warn">{pl(toWatch, 'sa.licences')}</span> : <span className="badge ok">{t('sa.enOrdre')}</span>}
              </div>
              <ul className="watch-list">
                <li className={cls((tt.expiring_licenses ?? 0) > 0 && 'warn')}>
                  <span className="state-icon warn"><LuCalendarClock /></span>
                  <div className="grow"><div className="strong">{t('sa.w.proches')}</div><div className="muted-s">{t('sa.w.prochesSous')}</div></div>
                  <span className="watch-n"><CountUp value={tt.expiring_licenses ?? 0} /></span>
                </li>
                <li className={cls((tt.expired_licenses ?? 0) > 0 && 'bad')}>
                  <span className="state-icon bad"><LuTriangleAlert /></span>
                  <div className="grow"><div className="strong">{t('sa.w.expirees')}</div><div className="muted-s">{t('sa.w.expireesSous')}</div></div>
                  <span className="watch-n"><CountUp value={tt.expired_licenses ?? 0} /></span>
                </li>
                <li>
                  <span className="state-icon trial"><LuHourglass /></span>
                  <div className="grow"><div className="strong">{t('sa.w.essais')}</div><div className="muted-s">{t('sa.w.essaisSous')}</div></div>
                  <span className="watch-n"><CountUp value={tt.trial_subscriptions ?? 0} /></span>
                </li>
              </ul>

              <div className="cash-sum">
                <div className="cash-sum-top">
                  <div><span className="stat-l">{t('sa.encaisseJour')}</span><div className="cash-sum-v"><CountUp value={pt.paid_amount ?? 0} format={fcfa} /></div></div>
                  <Link to="/paiements" className="link">{t('sa.paiements')} <LuArrowRight className="link-arrow" /></Link>
                </div>
                <div className="split-bar" aria-hidden="true">
                  <span className="ok" style={{ width: `${pct(pt.paid)}%` }} />
                  <span className="warn" style={{ width: `${pct((pt.unpaid ?? 0) + (pt.pending ?? 0))}%` }} />
                  <span className="bad" style={{ width: `${pct(pt.rejected)}%` }} />
                </div>
                <ul className="split-legend">
                  <li><i className="ok" />{t('sa.leg.payes', { n: String(pt.paid ?? 0) })}</li>
                  <li><i className="warn" />{t('sa.leg.attente', { n: String((pt.unpaid ?? 0) + (pt.pending ?? 0)) })}</li>
                  <li><i className="bad" />{t('sa.leg.rejetes', { n: String(pt.rejected ?? 0) })}</li>
                </ul>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <div><h2>{t('sa.derniersPaiements')}</h2><p className="panel-sub">{t('sa.derniersPaiementsSous')}</p></div>
              <Link to="/paiements" className="link">{t('sa.historique')} <LuArrowRight className="link-arrow" /></Link>
            </div>
            {transactions.length === 0
              ? <Empty title={t('sa.aucunPaiement')} />
              : paymentsTable(transactions.slice(0, 5), true)}
          </section>
        </>
      )}

      {view === 'tenants' && (
        <>
          {pageHead(<button className="btn btn-primary" type="button" onClick={() => focusForm('form-tenant')}><LuPlus /> {t('sa.inscrire')}</button>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuBuilding2 />} label={t('sa.stat.entreprises')} value={tt.total_tenants ?? 0} hint={pl(tt.active_tenants ?? 0, 'sa.actives')} />
            <Stat i={1} tone="gold" icon={<LuHourglass />} label={t('sa.stat.essai')} value={tt.trial_subscriptions ?? 0} hint={t('sa.stat.essaiHint')} />
            <Stat i={2} tone={(tt.expiring_licenses ?? 0) > 0 ? 'danger' : 'mute'} icon={<LuCalendarClock />} label={t('sa.stat.aRenouveler')} value={tt.expiring_licenses ?? 0} hint={t('sa.stat.dejaExpirees', { n: String(tt.expired_licenses ?? 0) })} />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>{t('sa.toutes')}</h2><p className="panel-sub">{t('sa.toutesSous')}</p></div>
                <span className="badge info">{paymentTenants.length}</span>
              </div>
              {paymentTenants.length === 0 ? (
                <Empty title={t('sa.aucuneEntrepriseForm')} />
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>{t('sa.col.entreprise')}</th><th>{t('tp.col.formule')}</th><th>{t('sa.col.abonnement')}</th><th>{t('tp.licence')}</th><th></th></tr></thead>
                    <tbody>
                      {paymentTenants.map((tenant) => {
                        const lic = tenant.licenses?.find((x) => x.status === 'active') ?? tenant.licenses?.[0];
                        return (
                          <tr key={tenant.id}>
                            <td>
                              <div className="entity">
                                <Avatar name={tenant.nom} />
                                <div className="grow">
                                  <div className="strong">{tenant.nom}</div>
                                  <div className="muted-s">{tenant.slug && <span className="mono">{tenant.slug}</span>}{tenant.slug && ' · '}{pl(tenant.boutiques?.length ?? 0, 'sa.boutiques')}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div>{tenant.subscription?.plan?.nom ?? <span className="muted-s">{t('sa.sansFormule')}</span>}</div>
                              {tenant.subscription?.plan?.prix != null && <div className="muted-s tnum">{fcfa(tenant.subscription.plan.prix)}</div>}
                            </td>
                            <td>
                              <div className="status-cell">
                                <StatusBadge status={tenant.subscription?.status} />
                                <select
                                  className="select sm"
                                  value={tenant.subscription?.status ?? 'active'}
                                  onChange={(e) => void handleStatusChange(tenant.id, e.target.value as 'active' | 'trial' | 'expired' | 'cancelled')}
                                  aria-label={t('sa.changerEtat', { nom: tenant.nom })}
                                >
                                  <option value="active">{t('billing.status.active')}</option>
                                  <option value="trial">{t('billing.status.trial')}</option>
                                  <option value="expired">{t('billing.status.expired')}</option>
                                  <option value="cancelled">{t('billing.status.cancelled')}</option>
                                </select>
                              </div>
                            </td>
                            <td>
                              <StatusBadge status={lic?.status} />
                              {lic?.expires_at && <div className="muted-s nowrap">{t('sa.jusqua', { d: fmtDate(lic.expires_at) })}</div>}
                            </td>
                            <td className="r">
                              <button className="btn btn-sm" type="button" onClick={() => renouvelerDepuisListe(tenant.id)} title={t('sa.encaisserPour', { nom: tenant.nom })}><LuWallet /> {t('sa.renouveler')}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel sa-aside" id="form-tenant">
              <div className="panel-head">
                <div><h2>{t('sa.inscrire')}</h2><p className="panel-sub">{t('sa.inscrireSous')}</p></div>
              </div>
              <form className="form-col" onSubmit={handleCreateTenant}>
                <fieldset className="step">
                  <legend><span className="step-n">1</span> {t('sa.col.entreprise')}</legend>
                  <div className="field"><label className="field-label" htmlFor="tn-nom">{t('sa.f.raisonSociale')}</label><input id="tn-nom" className="input" value={tenantForm.nom} onChange={(e) => setTenantForm({ ...tenantForm, nom: e.target.value })} placeholder={t('sa.f.raisonSocialeEx')} required /></div>
                  <div className="field"><label className="field-label" htmlFor="tn-slug">{t('sa.f.slug')}</label><input id="tn-slug" className="input mono" value={tenantForm.slug} onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value })} placeholder="akofa-wax" required /><span className="hint">{t('sa.f.slugHint')}</span></div>
                </fieldset>
                <fieldset className="step">
                  <legend><span className="step-n">2</span> {t('sa.f.premiereBoutique')}</legend>
                  <div className="row-2">
                    <div className="field"><label className="field-label" htmlFor="tn-bq">{t('sa.f.nomBoutique')}</label><input id="tn-bq" className="input" value={tenantForm.boutiqueNom} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueNom: e.target.value })} placeholder={t('sa.f.nomBoutiqueEx')} required /></div>
                    <div className="field"><label className="field-label" htmlFor="tn-tel">{t('clients.telephone')}</label><input id="tn-tel" className="input" inputMode="tel" value={tenantForm.boutiqueTelephone} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueTelephone: e.target.value })} placeholder="+228 90 00 00 00" /></div>
                  </div>
                  <div className="field"><label className="field-label" htmlFor="tn-adr">{t('clients.adresse')}</label><input id="tn-adr" className="input" value={tenantForm.boutiqueAdresse} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueAdresse: e.target.value })} placeholder={t('sa.f.adresseEx')} /></div>
                </fieldset>
                <fieldset className="step">
                  <legend><span className="step-n">3</span> {t('sa.f.abonnementInitial')}</legend>
                  <div className="field">
                    <label className="field-label" htmlFor="tn-plan">{t('tp.col.formule')}</label>
                    <select id="tn-plan" className="select" value={tenantForm.planId} onChange={(e) => setTenantForm({ ...tenantForm, planId: e.target.value })}>
                      <option value="">{t('sa.f.aucuneFormule')}</option>
                      {data.plans.map((plan) => <option key={plan.id} value={String(plan.id)}>{plan.nom}{plan.prix != null ? ` · ${fcfa(plan.prix)}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="row-2">
                    <div className="field">
                      <label className="field-label" htmlFor="tn-pm">{t('sa.f.moyen')}</label>
                      <select id="tn-pm" className="select" value={tenantForm.paymentMethod} onChange={(e) => setTenantForm({ ...tenantForm, paymentMethod: e.target.value })}>
                        <option value="cash">{t('billing.method.cash')}</option>
                        <option value="flooz">{t('billing.method.flooz')}</option>
                        <option value="tmoney">{t('billing.method.tmoney')}</option>
                        <option value="card">{t('sa.mode.card')}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor="tn-ref">{t('sa.f.referenceTransaction')}</label>
                      <input id="tn-ref" className="input mono" value={tenantForm.paymentReference} onChange={(e) => setTenantForm({ ...tenantForm, paymentReference: e.target.value })} placeholder="Ex. FLOOZ-12345" />
                    </div>
                  </div>
                </fieldset>
                <button className="btn btn-primary btn-block" type="submit"><LuPlus /> {t('sa.f.inscrireBouton')}</button>
              </form>
            </section>
          </div>
        </>
      )}

      {view === 'payments' && (
        <>
          {pageHead(<>
            <button className="btn" type="button" onClick={() => void downloadBlob('/super-admin/payments/export.csv', `paiements-${new Date().toISOString().slice(0, 10)}.csv`)}><LuDownload /> {t('sa.exporter')}</button>
            <button className="btn btn-primary" type="button" onClick={() => focusForm('form-payment')}><LuPlus /> {t('sa.encaisser')}</button>
          </>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="terra" icon={<LuWallet />} label={t('sa.stat.encaisse')} value={pt.paid_amount ?? 0} format={fcfa} hint={t('sa.stat.encaisseHint')} />
            <Stat i={1} tone="green" icon={<LuCircleCheck />} label={t('sa.stat.recus')} value={pt.paid ?? 0} />
            <Stat i={2} tone="gold" icon={<LuHourglass />} label={t('sa.stat.attente')} value={(pt.unpaid ?? 0) + (pt.pending ?? 0)} hint={t('sa.stat.attenteHint')} />
            <Stat i={3} tone={(pt.rejected ?? 0) > 0 ? 'danger' : 'mute'} icon={<LuTriangleAlert />} label={t('sa.stat.rejetes')} value={pt.rejected ?? 0} />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>{t('sa.histoPaiements')}</h2><p className="panel-sub">{t('sa.histoPaiementsSous')}</p></div>
                <span className="badge info">{transactions.length}</span>
              </div>
              {transactions.length === 0 ? <Empty title={t('sa.aucunPaiement')} /> : paymentsTable(transactions)}
            </section>

            <section className="panel sa-aside" id="form-payment">
              <div className="panel-head">
                <div>
                  <h2>{paymentForm.prolonger ? t('sa.encaisser') : t('sa.p.enregistrer')}</h2>
                  <p className="panel-sub">{paymentForm.prolonger ? t('sa.p.sousRenouveler') : t('sa.p.sousEnregistrer')}</p>
                </div>
              </div>
              <form className="form-col" onSubmit={handleCreatePayment}>
                <div className="field"><label className="field-label" htmlFor="py-tenant">{t('sa.col.entreprise')}</label><select id="py-tenant" className="select" value={paymentForm.tenantId} onChange={(event) => choisirTenant(event.target.value)} required><option value="">{t('sa.p.choisirEntreprise')}</option>{paymentTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.nom}</option>)}</select></div>
                {tenantChoisi && (
                  <p className="muted-s">
                    {t('sa.p.licenceActuelle')} <StatusBadge status={licenceChoisie?.status} /> {licenceChoisie?.expires_at ? t('sa.jusqua', { d: fmtDate(licenceChoisie.expires_at) }) : ''}
                  </p>
                )}

                <label className="check"><input type="checkbox" checked={paymentForm.prolonger} onChange={(e) => setPaymentForm({ ...paymentForm, prolonger: e.target.checked })} /> {t('sa.p.prolonger')}</label>

                {paymentForm.prolonger ? (
                  <div className="row-2">
                    <div className="field"><label className="field-label" htmlFor="py-plan">{t('tp.col.formule')}</label>
                      <select id="py-plan" className="select" value={paymentForm.planId} onChange={(e) => setPaymentForm({ ...paymentForm, planId: e.target.value })} required>
                        <option value="">{t('sa.p.choisirFormule')}</option>
                        {data.plans.map((plan) => <option key={plan.id} value={String(plan.id)}>{plan.nom} · {fcfa(plan.prix ?? 0)} / {plan.intervalle === 'year' ? t('sa.an') : t('sa.mois')}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="field-label" htmlFor="py-per">{planChoisi?.intervalle === 'year' ? t('sa.p.dureeAnnees') : t('sa.p.dureeMois')}</label>
                      <input id="py-per" className="input num" type="number" inputMode="numeric" min={1} max={36} step={1} value={paymentForm.periodes} onChange={(e) => setPaymentForm({ ...paymentForm, periodes: e.target.value })} required />
                    </div>
                  </div>
                ) : (
                  <div className="field"><label className="field-label" htmlFor="py-status">{t('tp.col.statut')}</label><select id="py-status" className="select" value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value })}><option value="pending">{t('sa.p.enVerification')}</option><option value="unpaid">{t('billing.status.unpaid')}</option><option value="rejected">{t('billing.status.rejected')}</option><option value="paid">{t('billing.status.paid')}</option></select></div>
                )}

                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="py-amount">{t('sa.p.montantRecu')}</label>
                    <input id="py-amount" className="input num" type="number" inputMode="numeric" min="0" step="1" value={montant} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value, amountAuto: false })} required />
                    {paymentForm.prolonger && !paymentForm.amountAuto && <button type="button" className="link" onClick={() => setPaymentForm({ ...paymentForm, amountAuto: true })}>{t('sa.p.tarifFormule')}</button>}
                  </div>
                  <div className="field"><label className="field-label" htmlFor="py-method">{t('sa.p.mode')}</label><select id="py-method" className="select" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{MODES.map(m => <option key={m.v} value={m.v}>{t(m.label)}</option>)}</select></div>
                </div>
                <div className="field"><label className="field-label" htmlFor="py-ref">{t('sa.p.reference')}</label>
                  <input id="py-ref" className="input mono" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder={t(MODES.find(m => m.v === paymentForm.method)?.ref ?? 'sa.ref.cash')} required />
                  <span className="hint">{t('sa.p.referenceHint')}</span>
                </div>
                <div className="field"><label className="field-label" htmlFor="py-file">{t('sa.p.justificatif')}</label><input id="py-file" className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setPaymentAttachment(event.target.files?.[0] ?? null)} /></div>
                <div className="field"><label className="field-label" htmlFor="py-note">{t('sa.p.note')}</label><input id="py-note" className="input" value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></div>

                {nouvelleFin && <p className="notice ok"><LuCalendarClock /> {t('sa.p.prolongeeJusqua')} <strong>{fmtDate(nouvelleFin.toISOString())}</strong>.</p>}
                <button className="btn btn-primary btn-block" type="submit"><LuReceipt /> {paymentForm.prolonger ? t('sa.p.boutonRenouveler') : t('sa.p.boutonEnregistrer')}</button>
              </form>
            </section>
          </div>
        </>
      )}

      {view === 'plans' && (
        <>
          {pageHead(<button className="btn btn-primary" type="button" onClick={() => focusForm('form-plan')}><LuPlus /> {t('sa.pl.nouvelle')}</button>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuLayers />} label={t('sa.pl.catalogueStat')} value={data.plans.length} />
            <Stat i={1} tone="green" icon={<LuBadgeCheck />} label={t('sa.pl.enVenteStat')} value={data.plans.filter(p => p.actif).length} hint={t('sa.pl.actives')} />
            <Stat i={2} tone="gold" icon={<LuUsers />} label={t('sa.pl.abonnees')} value={tt.active_subscriptions ?? 0} hint={t('sa.stat.abonnements')} />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>{t('sa.pl.catalogue')}</h2><p className="panel-sub">{t('sa.pl.catalogueSous')}</p></div>
              </div>
              {data.plans.length === 0 ? (
                <Empty title={t('sa.pl.aucune')} />
              ) : (
                <div className="plan-grid">
                  {data.plans.map((plan, i) => (
                    <article key={plan.id} className={cls('plan-card', !plan.actif && 'off')} style={{ ['--i' as string]: i } as React.CSSProperties}>
                      <div className="plan-top"><h3>{plan.nom}</h3><span className={cls('badge', plan.actif ? 'ok' : 'mute')}>{plan.actif ? t('sa.pl.enVente') : t('sa.pl.retiree')}</span></div>
                      <div className="plan-price">{fcfa(plan.prix ?? 0)}{plan.intervalle && <small> / {plan.intervalle === 'year' ? t('sa.an') : t('sa.mois')}</small>}</div>
                      <ul className="plan-feats">
                        <li><LuStore /> {pl(plan.max_boutiques ?? 0, 'sa.boutiques')}</li>
                        <li><LuUsers /> {pl(plan.max_utilisateurs ?? 0, 'sa.utilisateurs')}</li>
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel sa-aside" id="form-plan">
              <div className="panel-head">
                <div><h2>{t('sa.pl.creer')}</h2><p className="panel-sub">{t('sa.pl.creerSous')}</p></div>
              </div>
              <form className="form-col" onSubmit={handleCreatePlan}>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-nom">{t('sa.pl.nom')}</label><input id="pl-nom" className="input" value={planForm.nom} onChange={(e) => setPlanForm({ ...planForm, nom: e.target.value })} placeholder={t('sa.pl.nomEx')} required /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-slug">{t('sa.f.slug')}</label><input id="pl-slug" className="input mono" value={planForm.slug} onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })} placeholder="boutique-pro" required /></div>
                </div>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-prix">{t('sa.pl.prix')}</label><input id="pl-prix" className="input num" type="number" inputMode="numeric" min={0} value={planForm.prix} onChange={(e) => setPlanForm({ ...planForm, prix: e.target.value })} required /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-int">{t('sa.pl.facturation')}</label>
                    <select id="pl-int" className="select" value={planForm.intervalle} onChange={(e) => setPlanForm({ ...planForm, intervalle: e.target.value })}>
                      <option value="month">{t('sa.pl.mensuelle')}</option>
                      <option value="year">{t('sa.pl.annuelle')}</option>
                    </select>
                  </div>
                </div>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-bq">{t('sa.pl.boutiques')}</label><input id="pl-bq" className="input num" type="number" min={1} value={planForm.max_boutiques} onChange={(e) => setPlanForm({ ...planForm, max_boutiques: e.target.value })} /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-us">{t('sa.pl.utilisateurs')}</label><input id="pl-us" className="input num" type="number" min={1} value={planForm.max_utilisateurs} onChange={(e) => setPlanForm({ ...planForm, max_utilisateurs: e.target.value })} /></div>
                </div>
                <div className="field"><label className="field-label" htmlFor="pl-feat">{t('sa.pl.modules')}</label><input id="pl-feat" className="input mono" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="stock,ventes,users" /><span className="hint">{t('sa.pl.modulesHint')}</span></div>
                <label className="check"><input type="checkbox" checked={planForm.actif} onChange={(e) => setPlanForm({ ...planForm, actif: e.target.checked })} /> {t('sa.pl.proposer')}</label>
                <button className="btn btn-primary btn-block" type="submit"><LuPlus /> {t('sa.pl.enregistrer')}</button>
              </form>
            </section>
          </div>
        </>
      )}
      {user && <p className="sa-foot muted-s">{t('sa.connecte', { nom: user.nom, role: t('role.' + user.role) })}</p>}
    </div>
  );
}
