import React, { useEffect, useState } from 'react';
import {
  LuArrowRight, LuBadgeCheck, LuCalendarClock, LuCircleAlert, LuFileText, LuKeyRound, LuLayers, LuMapPin,
  LuPaperclip, LuPhone, LuShieldCheck, LuStore, LuUsers,
} from 'react-icons/lu';
import { get, getBlob } from '../api';
import { useApp } from '../store';
import { t } from '../i18n';
import { CountUp, Empty, Skeleton, SkeletonRows } from '../components/ui';
import { cls, fcfa, fmtDate } from '../lib/format';

interface TenantSummary {
  id: number;
  nom: string;
  slug?: string;
  statut?: string;
}

interface PlanSummary {
  id: number;
  nom: string;
  slug?: string;
  prix?: number;
  intervalle?: string;
  max_boutiques?: number;
  max_utilisateurs?: number;
}

interface SubscriptionSummary {
  id: number;
  status?: string;
  starts_at?: string;
  ends_at?: string;
  plan?: PlanSummary;
}

interface LicenseSummary {
  id: number;
  status?: string;
  cle?: string;
  expires_at?: string;
}

interface TenantPortalData {
  tenant: TenantSummary;
  boutique_access?: boolean;
  boutiques: Array<{ id: number; nom: string; statut?: string; adresse?: string; telephone?: string }>;
  subscription?: SubscriptionSummary | null;
  license?: LicenseSummary | null;
  stats: {
    boutiques_total?: number;
    users_total?: number;
    subscription_status?: string;
    license_status?: string;
    plan_name?: string | null;
    license_expires_at?: string | null;
  };
}

interface PaymentTransaction {
  id: number;
  amount: number;
  status: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string | null;
  created_at?: string;
  invoice_number?: string | null;
  attachment_name?: string | null;
  has_attachment?: boolean;
  plan?: { id: number; nom: string } | null;
}

/* ---------- Présentation ---------- */
type Tone = 'ok' | 'trial' | 'warn' | 'bad' | 'mute';
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
const dateOr = (iso?: string | null) => (iso ? fmtDate(iso) : '—');

export default function TenantPortal() {
  const { user, openBoutique } = useApp();
  const [data, setData] = useState<TenantPortalData | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [dashboard, planList, billing] = await Promise.all([
          get<TenantPortalData>('/tenant/dashboard'),
          get<PlanSummary[]>('/tenant/plans'),
          get<{ transactions: PaymentTransaction[] }>('/tenant/payments'),
        ]);
        if (!cancelled) {
          setData(dashboard);
          setPlans(planList);
          setPayments(billing.transactions ?? []);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Impossible de charger votre espace entreprise.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const downloadPaymentFile = async (path: string, filename: string) => {
    try {
      const blob = await getBlob(path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message ?? 'Téléchargement impossible.');
    }
  };

  const enterBoutique = async () => {
    const result = await openBoutique();
    if (!result.ok) setError(result.error ?? 'Impossible d’ouvrir la boutique.');
  };

  const intro = (title: React.ReactNode, actions?: React.ReactNode) => (
    <div className="page-head">
      <div>
        <span className="eyebrow">Espace entreprise</span>
        <h1>{title}</h1>
        <p className="muted-p page-sub">Suivez votre abonnement et votre licence, retrouvez vos factures et ouvrez vos boutiques.</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );

  if (loading) {
    return (
      <>
        {intro('Mon abonnement')}
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
        {intro('Mon abonnement')}
        <div className="panel state-box" role="alert">
          <span className="state-icon bad"><LuCircleAlert /></span>
          <div className="grow"><h2>Une erreur est survenue</h2><p className="muted-p">{error}</p></div>
          <button className="btn" onClick={() => window.location.reload()}>{t('common.reessayer')}</button>
        </div>
      </>
    );
  }
  if (!data) return <>{intro('Mon abonnement')}<div className="panel"><Empty title="Aucune entreprise n’est associée à ce compte." /></div></>;

  const subStatus = data.subscription?.status ?? data.stats.subscription_status;
  const licStatus = data.license?.status ?? data.stats.license_status;
  const planName = data.stats.plan_name ?? data.subscription?.plan?.nom;
  const currentPlan = plans.find(p => String(p.id) === String(data.subscription?.plan?.id ?? '')) ?? data.subscription?.plan;
  const expiration = data.stats.license_expires_at ?? data.license?.expires_at;
  const joursRestants = expiration ? Math.ceil((new Date(expiration).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="view">
      {intro(data.tenant.nom, data.boutique_access && (
        <button className="btn btn-primary" onClick={() => void enterBoutique()}><LuStore /> Ouvrir ma boutique <LuArrowRight /></button>
      ))}

      <div className="stat-grid">
        <div className="stat brand" style={{ ['--i' as string]: 0 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">Formule actuelle</span><span className="stat-icon" aria-hidden="true"><LuLayers /></span></div>
          <span className="stat-v stat-text">{planName ?? 'Aucune'}</span>
          <span className="stat-hint"><StatusBadge status={subStatus} /></span>
        </div>
        <div className={cls('stat', licStatus === 'active' ? 'green' : 'danger')} style={{ ['--i' as string]: 1 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">Licence</span><span className="stat-icon" aria-hidden="true"><LuShieldCheck /></span></div>
          <span className="stat-v stat-text">{t(`billing.status.${licStatus ?? 'none'}`)}</span>
          <span className="stat-hint">{data.stats.license_expires_at ? `Valable jusqu’au ${fmtDate(data.stats.license_expires_at)}` : 'Pas de date d’expiration'}</span>
        </div>
        <div className="stat gold" style={{ ['--i' as string]: 2 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">Boutiques</span><span className="stat-icon" aria-hidden="true"><LuStore /></span></div>
          <span className="stat-v"><CountUp value={data.stats.boutiques_total ?? data.boutiques.length} /></span>
          {currentPlan?.max_boutiques != null && <span className="stat-hint">sur {currentPlan.max_boutiques} incluse(s) dans la formule</span>}
        </div>
        <div className="stat terra" style={{ ['--i' as string]: 3 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">Utilisateurs</span><span className="stat-icon" aria-hidden="true"><LuUsers /></span></div>
          <span className="stat-v"><CountUp value={data.stats.users_total ?? 0} /></span>
          {currentPlan?.max_utilisateurs != null && <span className="stat-hint">sur {currentPlan.max_utilisateurs} inclus dans la formule</span>}
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div><h2>Votre abonnement</h2><p className="panel-sub">Période en cours et clé de licence de votre entreprise.</p></div>
            <StatusBadge status={data.subscription?.status} />
          </div>
          <dl className="facts">
            <div><dt><LuCalendarClock /> Début</dt><dd>{dateOr(data.subscription?.starts_at)}</dd></div>
            <div><dt><LuCalendarClock /> Fin</dt><dd>{dateOr(data.subscription?.ends_at)}</dd></div>
            <div><dt><LuShieldCheck /> Licence</dt><dd>{data.license?.status ? <StatusBadge status={data.license.status} /> : '—'}</dd></div>
            <div><dt><LuBadgeCheck /> Compte</dt><dd>{user?.nom ?? '—'}</dd></div>
            <div className="wide"><dt><LuKeyRound /> Clé de licence</dt><dd className="mono key">{data.license?.cle ?? '—'}</dd></div>
          </dl>

          {/* Pas d'intégrateur de paiement : le renouvellement est enregistré par l'équipe de la plateforme à réception du paiement. */}
          <div className="sub-block">
            <h3>Renouveler votre licence</h3>
            {joursRestants !== null && joursRestants <= 7 && (
              <p className={cls('notice', joursRestants < 0 ? 'err' : 'warn')} role="status">
                <LuCalendarClock /> {joursRestants < 0 ? 'Votre licence est expirée : la caisse de vos boutiques est bloquée.' : `Votre licence expire dans ${joursRestants} jour(s).`}
              </p>
            )}
            <ol className="steps-list">
              <li>Réglez votre abonnement en espèces, par carte, T-Money ou Flooz.</li>
              <li>Transmettez à notre équipe la <strong>référence</strong> du paiement (n° de reçu, de transaction ou de ticket carte).</li>
              <li>Votre licence est prolongée dès l’enregistrement du paiement ; la facture apparaît ci-dessous.</li>
            </ol>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><h2>Formules disponibles</h2><p className="panel-sub">Pour changer de formule, indiquez-la à notre équipe lors de votre prochain paiement.</p></div>
          </div>
          {plans.length === 0 ? <Empty title="Aucune formule publiée pour le moment." /> : (
            <ul className="plan-list">
              {plans.map((plan) => (
                <li key={plan.id} className={cls('plan-row', String(plan.id) === String(data.subscription?.plan?.id ?? '') && 'on')}>
                  <div className="grow">
                    <strong>{plan.nom}</strong>
                    <div className="muted-s">{plan.max_boutiques ?? '—'} boutique(s) · {plan.max_utilisateurs ?? '—'} utilisateur(s)</div>
                  </div>
                  <div className="r">
                    <strong>{fcfa(plan.prix ?? 0)}</strong>
                    <div className="muted-s">par {plan.intervalle === 'year' ? 'an' : 'mois'}</div>
                  </div>
                  {String(plan.id) === String(data.subscription?.plan?.id ?? '') && <span className="badge ok">Votre formule</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Vos boutiques</h2><p className="panel-sub">Les points de vente rattachés à votre entreprise.</p></div>
          <span className="badge info">{data.boutiques.length}</span>
        </div>
        {data.boutiques.length === 0 ? <Empty title="Aucune boutique n’est encore rattachée à votre entreprise." /> : (
          <ul className="shop-grid">
            {data.boutiques.map((boutique, i) => (
              <li key={boutique.id} className="shop-card" style={{ ['--i' as string]: i } as React.CSSProperties}>
                <div className="shop-top"><span className="shop-mark" aria-hidden="true" /><strong className="grow ellipsis">{boutique.nom}</strong><StatusBadge status={boutique.statut} /></div>
                <div className="muted-s shop-line"><LuMapPin /> {boutique.adresse ?? 'Adresse non renseignée'}</div>
                <div className="muted-s shop-line"><LuPhone /> {boutique.telephone ?? 'Téléphone non renseigné'}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Factures et paiements</h2><p className="panel-sub">Téléchargez vos factures et les justificatifs transmis.</p></div>
          <span className="badge info">{payments.length}</span>
        </div>
        {payments.length === 0 ? (
          <Empty title="Aucun paiement enregistré pour votre entreprise." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Facture</th><th>Formule</th><th className="r">Montant</th><th>Moyen</th><th>Statut</th><th>Documents</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="nowrap">{dateOr(payment.created_at)}</td>
                    <td className="mono">{payment.invoice_number ?? '—'}</td>
                    <td>{payment.plan?.nom ?? '—'}</td>
                    <td className="r strong nowrap">{fcfa(payment.amount)}</td>
                    <td><div>{t(`billing.method.${payment.payment_method ?? 'manual'}`)}</div>{payment.payment_reference && <div className="muted-s mono">{payment.payment_reference}</div>}</td>
                    <td><StatusBadge status={payment.status} /></td>
                    <td>
                      <div className="row-actions">
                        {payment.invoice_number && <button className="btn btn-sm" type="button" onClick={() => void downloadPaymentFile(`/tenant/payments/${payment.id}/invoice`, `${payment.invoice_number}.html`)}><LuFileText /> Facture</button>}
                        {payment.has_attachment && <button className="btn btn-sm" type="button" onClick={() => void downloadPaymentFile(`/tenant/payments/${payment.id}/attachment`, payment.attachment_name ?? `justificatif-${payment.id}`)}><LuPaperclip /> Justificatif</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel trust">
        <span className="state-icon ok"><LuShieldCheck /></span>
        <div className="grow">
          <h2>Comment vos accès sont protégés</h2>
          <ul className="trust-list">
            <li>Chaque connexion est vérifiée par le serveur, selon votre licence active.</li>
            <li>Le nombre de boutiques et d’utilisateurs suit votre formule.</li>
            <li>Cet espace affiche l’état réel de votre abonnement et de votre licence.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
