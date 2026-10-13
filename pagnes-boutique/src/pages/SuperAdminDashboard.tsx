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

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Modes d'encaissement acceptés par l'API (le mode « manual » des anciennes données n'est plus proposé). */
const MODES = [
  { v: 'cash', label: 'Espèces', ref: 'N° du reçu remis au client' },
  { v: 'card', label: 'Carte bancaire', ref: 'N° d’autorisation du ticket carte' },
  { v: 'tmoney', label: 'T-Money', ref: 'ID de la transaction T-Money' },
  { v: 'flooz', label: 'Flooz', ref: 'ID de la transaction Flooz' },
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
    eyebrow: 'Console plateforme', title: 'Pilotage de la plateforme',
    sub: 'La santé de votre activité SaaS en un coup d’œil : entreprises clientes, abonnements, licences à renouveler et encaissements.',
  },
  tenants: {
    eyebrow: 'Clients', title: 'Entreprises clientes',
    sub: 'Inscrivez une nouvelle entreprise avec sa première boutique, attribuez-lui une formule et gérez l’état de son abonnement.',
  },
  payments: {
    eyebrow: 'Facturation', title: 'Paiements et factures',
    sub: 'Encaissez les renouvellements (espèces, carte, T-Money, Flooz) avec leur référence de contrôle, téléchargez factures et justificatifs, exportez la comptabilité.',
  },
  plans: {
    eyebrow: 'Catalogue', title: 'Formules d’abonnement',
    sub: 'Définissez les offres vendues aux boutiques : prix, nombre de boutiques et d’utilisateurs inclus, modules ouverts.',
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
      setError(e?.message ?? 'Impossible de charger la console d’administration.');
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
      setStatus({ type: 'ok', msg: 'Formule créée : elle est proposée dès maintenant aux entreprises.' });
      setPlanForm({ ...planForm, nom: '', slug: '', prix: '0', max_boutiques: '1', max_utilisateurs: '5', features: 'stock,ventes,users' });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? 'Erreur lors de la création de la formule.' });
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

      setStatus({ type: 'ok', msg: 'Entreprise inscrite avec sa première boutique.' });
      setTenantForm({ nom: '', slug: '', boutiqueNom: '', boutiqueAdresse: '', boutiqueTelephone: '', planId: '', paymentMethod: 'cash', paymentReference: '' });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? 'Erreur lors de l’inscription de l’entreprise.' });
    }
  };

  const handleStatusChange = async (tenantId: number, nextStatus: 'active' | 'trial' | 'expired' | 'cancelled') => {
    try {
      await put(`/super-admin/tenants/${tenantId}/subscription-status`, {
        status: nextStatus,
        license_status: nextStatus === 'cancelled' ? 'suspended' : nextStatus === 'expired' ? 'expired' : 'active',
      });
      setStatus({ type: 'ok', msg: `Abonnement mis à jour : ${t(`billing.status.${nextStatus}`)}.` });
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? 'Erreur lors de la mise à jour du statut.' });
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
        setStatus({ type: 'ok', msg: `Paiement encaissé : licence de ${tenantChoisi?.nom ?? 'l’entreprise'} prolongée${nouvelleFin ? ` jusqu’au ${fmtDate(nouvelleFin.toISOString())}` : ''}. Facture générée.` });
      } else {
        await post(`/super-admin/tenants/${paymentForm.tenantId}/payments`, form);
        setStatus({ type: 'ok', msg: 'Paiement enregistré et facture générée (licence inchangée).' });
      }
      setPaymentForm(PAIEMENT_VIDE);
      setPaymentAttachment(null);
      await reload();
    } catch (e: any) {
      setStatus({ type: 'err', msg: e?.message ?? 'Erreur lors de l’enregistrement du paiement.' });
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
      setStatus({ type: 'err', msg: e?.message ?? 'Téléchargement impossible.' });
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
        <span className="eyebrow">{head.eyebrow}</span>
        <h1>{head.title}</h1>
        <p className="muted-p page-sub">{head.sub}</p>
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
          <div className="grow"><h2>La console n’a pas pu être chargée</h2><p className="muted-p">{error}</p></div>
          <button className="btn" onClick={() => void reload()}>{t('common.reessayer')}</button>
        </div>
      </>
    );
  }
  if (!data) return <>{pageHead()}<div className="panel"><Empty title="Aucun indicateur disponible pour le moment." /></div></>;

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
      <button className="icon-btn" type="button" onClick={() => void downloadBlob(`/super-admin/payments/${payment.id}/invoice`, `${payment.invoice_number ?? `facture-${payment.id}`}.html`)} title="Télécharger la facture (HTML)" aria-label="Télécharger la facture">
        <LuFileText />
      </button>
      {payment.has_attachment && <button className="icon-btn" type="button" onClick={() => void downloadBlob(`/super-admin/payments/${payment.id}/attachment`, payment.attachment_name ?? `justificatif-${payment.id}`)} title="Télécharger le justificatif du client" aria-label="Télécharger le justificatif"><LuPaperclip /></button>}
    </div>
  );

  const paymentsTable = (rows: PaymentSummary[], compact = false) => (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>
          {!compact && <th>Date</th>}<th>Entreprise</th>{!compact && <th>Formule</th>}<th className="r">Montant</th><th>Moyen</th><th>Statut</th>{!compact && <th>Documents</th>}
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
            <Link to="/paiements" className="btn"><LuWallet /> Encaisser un renouvellement</Link>
            <Link to="/tenants" className="btn btn-primary"><LuPlus /> Inscrire une entreprise</Link>
          </>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuBuilding2 />} label="Entreprises clientes" value={tt.total_tenants ?? 0} hint={`${plural(tt.active_tenants ?? 0, 'active', 'actives')} sur la plateforme`} />
            <Stat i={1} tone="green" icon={<LuStore />} label="Boutiques équipées" value={tt.total_boutiques ?? 0} hint="Points de vente qui utilisent la caisse" />
            <Stat i={2} tone="gold" icon={<LuBadgeCheck />} label="Abonnements actifs" value={tt.active_subscriptions ?? 0} hint={`+ ${tt.trial_subscriptions ?? 0} en période d’essai`} />
            <Stat i={3} tone="terra" icon={<LuTrendingUp />} label="Revenu mensuel récurrent" value={tt.mrr ?? 0} format={fcfa} hint="Ce que rapportent les abonnements chaque mois" />
          </div>

          <div className="sa-grid">
            <section className="panel">
              <div className="panel-head">
                <div><h2>Dernières entreprises inscrites</h2><p className="panel-sub">Formule choisie et état du compte de chaque client.</p></div>
                <Link to="/tenants" className="link">Toutes les entreprises <LuArrowRight className="link-arrow" /></Link>
              </div>
              {data.tenants.length === 0 ? (
                <Empty title="Aucune entreprise cliente pour l’instant.">
                  <Link to="/tenants" className="btn btn-sm btn-primary"><LuPlus /> Inscrire la première</Link>
                </Empty>
              ) : (
                <ul className="entity-list">
                  {data.tenants.slice(0, 6).map((tenant) => (
                    <li key={tenant.id}>
                      <Avatar name={tenant.nom} />
                      <div className="grow">
                        <div className="strong ellipsis">{tenant.nom}</div>
                        <div className="muted-s">{tenant.subscription?.plan?.nom ?? 'Sans formule'} · {plural(tenant.boutiques?.length ?? 0, 'boutique', 'boutiques')}</div>
                      </div>
                      <StatusBadge status={tenant.statut} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div><h2>À surveiller</h2><p className="panel-sub">Comptes à relancer avant qu’ils ne perdent l’accès.</p></div>
                {toWatch > 0 ? <span className="badge warn">{plural(toWatch, 'licence', 'licences')}</span> : <span className="badge ok">Tout est en ordre</span>}
              </div>
              <ul className="watch-list">
                <li className={cls((tt.expiring_licenses ?? 0) > 0 && 'warn')}>
                  <span className="state-icon warn"><LuCalendarClock /></span>
                  <div className="grow"><div className="strong">Licences proches de l’expiration</div><div className="muted-s">Proposez le renouvellement dès maintenant.</div></div>
                  <span className="watch-n"><CountUp value={tt.expiring_licenses ?? 0} /></span>
                </li>
                <li className={cls((tt.expired_licenses ?? 0) > 0 && 'bad')}>
                  <span className="state-icon bad"><LuTriangleAlert /></span>
                  <div className="grow"><div className="strong">Licences expirées</div><div className="muted-s">Ces boutiques ne peuvent plus vendre.</div></div>
                  <span className="watch-n"><CountUp value={tt.expired_licenses ?? 0} /></span>
                </li>
                <li>
                  <span className="state-icon trial"><LuHourglass /></span>
                  <div className="grow"><div className="strong">Essais en cours</div><div className="muted-s">À convertir en abonnement payant.</div></div>
                  <span className="watch-n"><CountUp value={tt.trial_subscriptions ?? 0} /></span>
                </li>
              </ul>

              <div className="cash-sum">
                <div className="cash-sum-top">
                  <div><span className="stat-l">Encaissé à ce jour</span><div className="cash-sum-v"><CountUp value={pt.paid_amount ?? 0} format={fcfa} /></div></div>
                  <Link to="/paiements" className="link">Paiements <LuArrowRight className="link-arrow" /></Link>
                </div>
                <div className="split-bar" aria-hidden="true">
                  <span className="ok" style={{ width: `${pct(pt.paid)}%` }} />
                  <span className="warn" style={{ width: `${pct((pt.unpaid ?? 0) + (pt.pending ?? 0))}%` }} />
                  <span className="bad" style={{ width: `${pct(pt.rejected)}%` }} />
                </div>
                <ul className="split-legend">
                  <li><i className="ok" />{pt.paid ?? 0} payés</li>
                  <li><i className="warn" />{(pt.unpaid ?? 0) + (pt.pending ?? 0)} en attente</li>
                  <li><i className="bad" />{pt.rejected ?? 0} rejetés</li>
                </ul>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <div><h2>Derniers paiements reçus</h2><p className="panel-sub">Les règlements les plus récents, toutes entreprises confondues.</p></div>
              <Link to="/paiements" className="link">Tout l’historique <LuArrowRight className="link-arrow" /></Link>
            </div>
            {transactions.length === 0
              ? <Empty title="Aucun paiement enregistré pour l’instant." />
              : paymentsTable(transactions.slice(0, 5), true)}
          </section>
        </>
      )}

      {view === 'tenants' && (
        <>
          {pageHead(<button className="btn btn-primary" type="button" onClick={() => focusForm('form-tenant')}><LuPlus /> Inscrire une entreprise</button>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuBuilding2 />} label="Entreprises clientes" value={tt.total_tenants ?? 0} hint={`${plural(tt.active_tenants ?? 0, 'active', 'actives')}`} />
            <Stat i={1} tone="gold" icon={<LuHourglass />} label="En période d’essai" value={tt.trial_subscriptions ?? 0} hint="À convertir en abonnement" />
            <Stat i={2} tone={(tt.expiring_licenses ?? 0) > 0 ? 'danger' : 'mute'} icon={<LuCalendarClock />} label="Licences à renouveler" value={tt.expiring_licenses ?? 0} hint={`${tt.expired_licenses ?? 0} déjà expirée(s)`} />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>Toutes les entreprises</h2><p className="panel-sub">Changez l’état d’un abonnement directement dans la liste.</p></div>
                <span className="badge info">{paymentTenants.length}</span>
              </div>
              {paymentTenants.length === 0 ? (
                <Empty title="Aucune entreprise cliente pour l’instant. Inscrivez la première boutique de pagnes avec le formulaire." />
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Entreprise</th><th>Formule</th><th>Abonnement</th><th>Licence</th><th></th></tr></thead>
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
                                  <div className="muted-s">{tenant.slug && <span className="mono">{tenant.slug}</span>}{tenant.slug && ' · '}{plural(tenant.boutiques?.length ?? 0, 'boutique', 'boutiques')}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div>{tenant.subscription?.plan?.nom ?? <span className="muted-s">Sans formule</span>}</div>
                              {tenant.subscription?.plan?.prix != null && <div className="muted-s tnum">{fcfa(tenant.subscription.plan.prix)}</div>}
                            </td>
                            <td>
                              <div className="status-cell">
                                <StatusBadge status={tenant.subscription?.status} />
                                <select
                                  className="select sm"
                                  value={tenant.subscription?.status ?? 'active'}
                                  onChange={(e) => void handleStatusChange(tenant.id, e.target.value as 'active' | 'trial' | 'expired' | 'cancelled')}
                                  aria-label={`Changer l’état de l’abonnement de ${tenant.nom}`}
                                >
                                  <option value="active">Actif</option>
                                  <option value="trial">Essai</option>
                                  <option value="expired">Expiré</option>
                                  <option value="cancelled">Annulé</option>
                                </select>
                              </div>
                            </td>
                            <td>
                              <StatusBadge status={lic?.status} />
                              {lic?.expires_at && <div className="muted-s nowrap">jusqu’au {fmtDate(lic.expires_at)}</div>}
                            </td>
                            <td className="r">
                              <button className="btn btn-sm" type="button" onClick={() => renouvelerDepuisListe(tenant.id)} title={`Encaisser le renouvellement de ${tenant.nom}`}><LuWallet /> Renouveler</button>
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
                <div><h2>Inscrire une entreprise</h2><p className="panel-sub">Le compte, sa première boutique et, si vous le souhaitez, sa formule.</p></div>
              </div>
              <form className="form-col" onSubmit={handleCreateTenant}>
                <fieldset className="step">
                  <legend><span className="step-n">1</span> Entreprise</legend>
                  <div className="field"><label className="field-label" htmlFor="tn-nom">Raison sociale</label><input id="tn-nom" className="input" value={tenantForm.nom} onChange={(e) => setTenantForm({ ...tenantForm, nom: e.target.value })} placeholder="Ex. Ets Akofa Wax" required /></div>
                  <div className="field"><label className="field-label" htmlFor="tn-slug">Identifiant court</label><input id="tn-slug" className="input mono" value={tenantForm.slug} onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value })} placeholder="akofa-wax" required /><span className="hint">Sans espace ni accent : il identifie l’entreprise sur la plateforme.</span></div>
                </fieldset>
                <fieldset className="step">
                  <legend><span className="step-n">2</span> Première boutique</legend>
                  <div className="row-2">
                    <div className="field"><label className="field-label" htmlFor="tn-bq">Nom de la boutique</label><input id="tn-bq" className="input" value={tenantForm.boutiqueNom} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueNom: e.target.value })} placeholder="Ex. Grand Marché" required /></div>
                    <div className="field"><label className="field-label" htmlFor="tn-tel">Téléphone</label><input id="tn-tel" className="input" inputMode="tel" value={tenantForm.boutiqueTelephone} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueTelephone: e.target.value })} placeholder="+228 90 00 00 00" /></div>
                  </div>
                  <div className="field"><label className="field-label" htmlFor="tn-adr">Adresse</label><input id="tn-adr" className="input" value={tenantForm.boutiqueAdresse} onChange={(e) => setTenantForm({ ...tenantForm, boutiqueAdresse: e.target.value })} placeholder="Quartier, ville" /></div>
                </fieldset>
                <fieldset className="step">
                  <legend><span className="step-n">3</span> Abonnement initial</legend>
                  <div className="field">
                    <label className="field-label" htmlFor="tn-plan">Formule</label>
                    <select id="tn-plan" className="select" value={tenantForm.planId} onChange={(e) => setTenantForm({ ...tenantForm, planId: e.target.value })}>
                      <option value="">Aucune formule pour l’instant</option>
                      {data.plans.map((plan) => <option key={plan.id} value={String(plan.id)}>{plan.nom}{plan.prix != null ? ` · ${fcfa(plan.prix)}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="row-2">
                    <div className="field">
                      <label className="field-label" htmlFor="tn-pm">Moyen de paiement</label>
                      <select id="tn-pm" className="select" value={tenantForm.paymentMethod} onChange={(e) => setTenantForm({ ...tenantForm, paymentMethod: e.target.value })}>
                        <option value="cash">Espèces</option>
                        <option value="flooz">Flooz</option>
                        <option value="tmoney">TMoney</option>
                        <option value="card">Carte bancaire</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor="tn-ref">Référence de transaction</label>
                      <input id="tn-ref" className="input mono" value={tenantForm.paymentReference} onChange={(e) => setTenantForm({ ...tenantForm, paymentReference: e.target.value })} placeholder="Ex. FLOOZ-12345" />
                    </div>
                  </div>
                </fieldset>
                <button className="btn btn-primary btn-block" type="submit"><LuPlus /> Inscrire l’entreprise</button>
              </form>
            </section>
          </div>
        </>
      )}

      {view === 'payments' && (
        <>
          {pageHead(<>
            <button className="btn" type="button" onClick={() => void downloadBlob('/super-admin/payments/export.csv', `paiements-${new Date().toISOString().slice(0, 10)}.csv`)}><LuDownload /> Exporter en CSV</button>
            <button className="btn btn-primary" type="button" onClick={() => focusForm('form-payment')}><LuPlus /> Encaisser un renouvellement</button>
          </>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="terra" icon={<LuWallet />} label="Montant encaissé" value={pt.paid_amount ?? 0} format={fcfa} hint="Total des paiements validés" />
            <Stat i={1} tone="green" icon={<LuCircleCheck />} label="Paiements reçus" value={pt.paid ?? 0} />
            <Stat i={2} tone="gold" icon={<LuHourglass />} label="En attente ou impayés" value={(pt.unpaid ?? 0) + (pt.pending ?? 0)} hint="À relancer" />
            <Stat i={3} tone={(pt.rejected ?? 0) > 0 ? 'danger' : 'mute'} icon={<LuTriangleAlert />} label="Rejetés" value={pt.rejected ?? 0} />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>Historique des paiements</h2><p className="panel-sub">Chaque paiement génère une facture téléchargeable.</p></div>
                <span className="badge info">{transactions.length}</span>
              </div>
              {transactions.length === 0 ? <Empty title="Aucun paiement enregistré pour l’instant." /> : paymentsTable(transactions)}
            </section>

            <section className="panel sa-aside" id="form-payment">
              <div className="panel-head">
                <div>
                  <h2>{paymentForm.prolonger ? 'Encaisser un renouvellement' : 'Enregistrer un paiement'}</h2>
                  <p className="panel-sub">{paymentForm.prolonger ? 'Le paiement reçu prolonge l’abonnement et la licence ; la facture est générée.' : 'Le paiement est consigné sans toucher à la licence.'}</p>
                </div>
              </div>
              <form className="form-col" onSubmit={handleCreatePayment}>
                <div className="field"><label className="field-label" htmlFor="py-tenant">Entreprise</label><select id="py-tenant" className="select" value={paymentForm.tenantId} onChange={(event) => choisirTenant(event.target.value)} required><option value="">Choisir une entreprise</option>{paymentTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.nom}</option>)}</select></div>
                {tenantChoisi && (
                  <p className="muted-s">
                    Licence actuelle : <StatusBadge status={licenceChoisie?.status} /> {licenceChoisie?.expires_at ? `jusqu’au ${fmtDate(licenceChoisie.expires_at)}` : ''}
                  </p>
                )}

                <label className="check"><input type="checkbox" checked={paymentForm.prolonger} onChange={(e) => setPaymentForm({ ...paymentForm, prolonger: e.target.checked })} /> Prolonger la licence avec ce paiement</label>

                {paymentForm.prolonger ? (
                  <div className="row-2">
                    <div className="field"><label className="field-label" htmlFor="py-plan">Formule</label>
                      <select id="py-plan" className="select" value={paymentForm.planId} onChange={(e) => setPaymentForm({ ...paymentForm, planId: e.target.value })} required>
                        <option value="">Choisir une formule</option>
                        {data.plans.map((plan) => <option key={plan.id} value={String(plan.id)}>{plan.nom} · {fcfa(plan.prix ?? 0)} / {plan.intervalle === 'year' ? 'an' : 'mois'}</option>)}
                      </select>
                    </div>
                    <div className="field"><label className="field-label" htmlFor="py-per">Durée ({planChoisi?.intervalle === 'year' ? 'années' : 'mois'})</label>
                      <input id="py-per" className="input num" type="number" inputMode="numeric" min={1} max={36} step={1} value={paymentForm.periodes} onChange={(e) => setPaymentForm({ ...paymentForm, periodes: e.target.value })} required />
                    </div>
                  </div>
                ) : (
                  <div className="field"><label className="field-label" htmlFor="py-status">Statut</label><select id="py-status" className="select" value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value })}><option value="pending">En attente de vérification</option><option value="unpaid">Non payé</option><option value="rejected">Rejeté</option><option value="paid">Payé</option></select></div>
                )}

                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="py-amount">Montant reçu (FCFA)</label>
                    <input id="py-amount" className="input num" type="number" inputMode="numeric" min="0" step="1" value={montant} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value, amountAuto: false })} required />
                    {paymentForm.prolonger && !paymentForm.amountAuto && <button type="button" className="link" onClick={() => setPaymentForm({ ...paymentForm, amountAuto: true })}>Revenir au tarif de la formule</button>}
                  </div>
                  <div className="field"><label className="field-label" htmlFor="py-method">Mode de paiement</label><select id="py-method" className="select" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{MODES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}</select></div>
                </div>
                <div className="field"><label className="field-label" htmlFor="py-ref">Référence</label>
                  <input id="py-ref" className="input mono" value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder={MODES.find(m => m.v === paymentForm.method)?.ref} required />
                  <span className="hint">Obligatoire pour le contrôle : une même référence ne peut pas être enregistrée deux fois pour un même mode.</span>
                </div>
                <div className="field"><label className="field-label" htmlFor="py-file">Justificatif (PDF, JPG, PNG)</label><input id="py-file" className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setPaymentAttachment(event.target.files?.[0] ?? null)} /></div>
                <div className="field"><label className="field-label" htmlFor="py-note">Note interne</label><input id="py-note" className="input" value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></div>

                {nouvelleFin && <p className="notice ok"><LuCalendarClock /> Licence prolongée jusqu’au <strong>{fmtDate(nouvelleFin.toISOString())}</strong>.</p>}
                <button className="btn btn-primary btn-block" type="submit"><LuReceipt /> {paymentForm.prolonger ? 'Encaisser et renouveler' : 'Enregistrer et générer la facture'}</button>
              </form>
            </section>
          </div>
        </>
      )}

      {view === 'plans' && (
        <>
          {pageHead(<button className="btn btn-primary" type="button" onClick={() => focusForm('form-plan')}><LuPlus /> Nouvelle formule</button>)}
          {notice}

          <div className="stat-grid">
            <Stat i={0} tone="brand" icon={<LuLayers />} label="Formules au catalogue" value={data.plans.length} />
            <Stat i={1} tone="green" icon={<LuBadgeCheck />} label="Proposées à la vente" value={data.plans.filter(p => p.actif).length} hint="Formules actives" />
            <Stat i={2} tone="gold" icon={<LuUsers />} label="Entreprises abonnées" value={tt.active_subscriptions ?? 0} hint="Abonnements actifs" />
          </div>

          <div className="sa-split">
            <section className="panel">
              <div className="panel-head">
                <div><h2>Catalogue des formules</h2><p className="panel-sub">Ce que chaque offre comprend, telle que vos clients la voient.</p></div>
              </div>
              {data.plans.length === 0 ? (
                <Empty title="Aucune formule pour l’instant. Créez votre première offre avec le formulaire." />
              ) : (
                <div className="plan-grid">
                  {data.plans.map((plan, i) => (
                    <article key={plan.id} className={cls('plan-card', !plan.actif && 'off')} style={{ ['--i' as string]: i } as React.CSSProperties}>
                      <div className="plan-top"><h3>{plan.nom}</h3><span className={cls('badge', plan.actif ? 'ok' : 'mute')}>{plan.actif ? 'En vente' : 'Retirée'}</span></div>
                      <div className="plan-price">{fcfa(plan.prix ?? 0)}{plan.intervalle && <small> / {plan.intervalle === 'year' ? 'an' : 'mois'}</small>}</div>
                      <ul className="plan-feats">
                        <li><LuStore /> {plural(plan.max_boutiques ?? 0, 'boutique', 'boutiques')}</li>
                        <li><LuUsers /> {plural(plan.max_utilisateurs ?? 0, 'utilisateur', 'utilisateurs')}</li>
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel sa-aside" id="form-plan">
              <div className="panel-head">
                <div><h2>Créer une formule</h2><p className="panel-sub">Elle sera proposée aux entreprises dès son activation.</p></div>
              </div>
              <form className="form-col" onSubmit={handleCreatePlan}>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-nom">Nom de la formule</label><input id="pl-nom" className="input" value={planForm.nom} onChange={(e) => setPlanForm({ ...planForm, nom: e.target.value })} placeholder="Ex. Boutique Pro" required /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-slug">Identifiant court</label><input id="pl-slug" className="input mono" value={planForm.slug} onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })} placeholder="boutique-pro" required /></div>
                </div>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-prix">Prix (FCFA)</label><input id="pl-prix" className="input num" type="number" inputMode="numeric" min={0} value={planForm.prix} onChange={(e) => setPlanForm({ ...planForm, prix: e.target.value })} required /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-int">Facturation</label>
                    <select id="pl-int" className="select" value={planForm.intervalle} onChange={(e) => setPlanForm({ ...planForm, intervalle: e.target.value })}>
                      <option value="month">Mensuelle</option>
                      <option value="year">Annuelle</option>
                    </select>
                  </div>
                </div>
                <div className="row-2">
                  <div className="field"><label className="field-label" htmlFor="pl-bq">Boutiques incluses</label><input id="pl-bq" className="input num" type="number" min={1} value={planForm.max_boutiques} onChange={(e) => setPlanForm({ ...planForm, max_boutiques: e.target.value })} /></div>
                  <div className="field"><label className="field-label" htmlFor="pl-us">Utilisateurs inclus</label><input id="pl-us" className="input num" type="number" min={1} value={planForm.max_utilisateurs} onChange={(e) => setPlanForm({ ...planForm, max_utilisateurs: e.target.value })} /></div>
                </div>
                <div className="field"><label className="field-label" htmlFor="pl-feat">Modules ouverts</label><input id="pl-feat" className="input mono" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="stock,ventes,users" /><span className="hint">Séparés par des virgules.</span></div>
                <label className="check"><input type="checkbox" checked={planForm.actif} onChange={(e) => setPlanForm({ ...planForm, actif: e.target.checked })} /> Proposer cette formule à la vente</label>
                <button className="btn btn-primary btn-block" type="submit"><LuPlus /> Enregistrer la formule</button>
              </form>
            </section>
          </div>
        </>
      )}
      {user && <p className="sa-foot muted-s">Connecté en tant que {user.nom} · {t('role.' + user.role)}</p>}
    </div>
  );
}
