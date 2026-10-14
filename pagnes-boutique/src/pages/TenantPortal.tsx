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
        if (!cancelled) setError(e?.message ?? t('tp.erreurChargement'));
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
      setError(e?.message ?? t('tp.erreurTelechargement'));
    }
  };

  const enterBoutique = async () => {
    const result = await openBoutique();
    if (!result.ok) setError(result.error ?? t('tp.erreurBoutique'));
  };

  const intro = (title: React.ReactNode, actions?: React.ReactNode) => (
    <div className="page-head">
      <div>
        <span className="eyebrow">{t('tp.espace')}</span>
        <h1>{title}</h1>
        <p className="muted-p page-sub">{t('tp.sousTitre')}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );

  if (loading) {
    return (
      <>
        {intro(t('tp.monAbonnement'))}
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
        {intro(t('tp.monAbonnement'))}
        <div className="panel state-box" role="alert">
          <span className="state-icon bad"><LuCircleAlert /></span>
          <div className="grow"><h2>{t('tp.erreurTitre')}</h2><p className="muted-p">{error}</p></div>
          <button className="btn" onClick={() => window.location.reload()}>{t('common.reessayer')}</button>
        </div>
      </>
    );
  }
  if (!data) return <>{intro(t('tp.monAbonnement'))}<div className="panel"><Empty title={t('tp.aucuneEntreprise')} /></div></>;

  const subStatus = data.subscription?.status ?? data.stats.subscription_status;
  const licStatus = data.license?.status ?? data.stats.license_status;
  const planName = data.stats.plan_name ?? data.subscription?.plan?.nom;
  const currentPlan = plans.find(p => String(p.id) === String(data.subscription?.plan?.id ?? '')) ?? data.subscription?.plan;
  const expiration = data.stats.license_expires_at ?? data.license?.expires_at;
  const joursRestants = expiration ? Math.ceil((new Date(expiration).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="view">
      {intro(data.tenant.nom, data.boutique_access && (
        <button className="btn btn-primary" onClick={() => void enterBoutique()}><LuStore /> {t('tp.ouvrirBoutique')} <LuArrowRight /></button>
      ))}

      <div className="stat-grid">
        <div className="stat brand" style={{ ['--i' as string]: 0 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">{t('tp.formuleActuelle')}</span><span className="stat-icon" aria-hidden="true"><LuLayers /></span></div>
          <span className="stat-v stat-text">{planName ?? t('tp.aucune')}</span>
          <span className="stat-hint"><StatusBadge status={subStatus} /></span>
        </div>
        <div className={cls('stat', licStatus === 'active' ? 'green' : 'danger')} style={{ ['--i' as string]: 1 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">{t('tp.licence')}</span><span className="stat-icon" aria-hidden="true"><LuShieldCheck /></span></div>
          <span className="stat-v stat-text">{t(`billing.status.${licStatus ?? 'none'}`)}</span>
          <span className="stat-hint">{data.stats.license_expires_at ? t('tp.valableJusqua', { d: fmtDate(data.stats.license_expires_at) }) : t('tp.sansExpiration')}</span>
        </div>
        <div className="stat gold" style={{ ['--i' as string]: 2 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">{t('tp.boutiques')}</span><span className="stat-icon" aria-hidden="true"><LuStore /></span></div>
          <span className="stat-v"><CountUp value={data.stats.boutiques_total ?? data.boutiques.length} /></span>
          {currentPlan?.max_boutiques != null && <span className="stat-hint">{t('tp.boutiquesIncluses', { n: String(currentPlan.max_boutiques) })}</span>}
        </div>
        <div className="stat terra" style={{ ['--i' as string]: 3 } as React.CSSProperties}>
          <div className="stat-top"><span className="stat-l">{t('tp.utilisateurs')}</span><span className="stat-icon" aria-hidden="true"><LuUsers /></span></div>
          <span className="stat-v"><CountUp value={data.stats.users_total ?? 0} /></span>
          {currentPlan?.max_utilisateurs != null && <span className="stat-hint">{t('tp.utilisateursInclus', { n: String(currentPlan.max_utilisateurs) })}</span>}
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div><h2>{t('tp.votreAbonnement')}</h2><p className="panel-sub">{t('tp.votreAbonnementSous')}</p></div>
            <StatusBadge status={data.subscription?.status} />
          </div>
          <dl className="facts">
            <div><dt><LuCalendarClock /> {t('tp.debut')}</dt><dd>{dateOr(data.subscription?.starts_at)}</dd></div>
            <div><dt><LuCalendarClock /> {t('tp.fin')}</dt><dd>{dateOr(data.subscription?.ends_at)}</dd></div>
            <div><dt><LuShieldCheck /> {t('tp.licence')}</dt><dd>{data.license?.status ? <StatusBadge status={data.license.status} /> : '—'}</dd></div>
            <div><dt><LuBadgeCheck /> {t('tp.compte')}</dt><dd>{user?.nom ?? '—'}</dd></div>
            <div className="wide"><dt><LuKeyRound /> {t('tp.cleLicence')}</dt><dd className="mono key">{data.license?.cle ?? '—'}</dd></div>
          </dl>

          {/* Pas d'intégrateur de paiement : le renouvellement est enregistré par l'équipe de la plateforme à réception du paiement. */}
          <div className="sub-block">
            <h3>{t('tp.renouveler')}</h3>
            {joursRestants !== null && joursRestants <= 7 && (
              <p className={cls('notice', joursRestants < 0 ? 'err' : 'warn')} role="status">
                <LuCalendarClock /> {joursRestants < 0 ? t('tp.licenceExpiree') : t('tp.licenceExpireDans', { n: String(joursRestants) })}
              </p>
            )}
            <ol className="steps-list">
              <li>{t('tp.etape1')}</li>
              <li>{t('tp.etape2.avant')}<strong>{t('tp.etape2.mot')}</strong>{t('tp.etape2.apres')}</li>
              <li>{t('tp.etape3')}</li>
            </ol>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><h2>{t('tp.formules')}</h2><p className="panel-sub">{t('tp.formulesSous')}</p></div>
          </div>
          {plans.length === 0 ? <Empty title={t('tp.aucuneFormule')} /> : (
            <ul className="plan-list">
              {plans.map((plan) => (
                <li key={plan.id} className={cls('plan-row', String(plan.id) === String(data.subscription?.plan?.id ?? '') && 'on')}>
                  <div className="grow">
                    <strong>{plan.nom}</strong>
                    <div className="muted-s">{t('tp.limites', { b: String(plan.max_boutiques ?? '—'), u: String(plan.max_utilisateurs ?? '—') })}</div>
                  </div>
                  <div className="r">
                    <strong>{fcfa(plan.prix ?? 0)}</strong>
                    <div className="muted-s">{plan.intervalle === 'year' ? t('tp.parAn') : t('tp.parMois')}</div>
                  </div>
                  {String(plan.id) === String(data.subscription?.plan?.id ?? '') && <span className="badge ok">{t('tp.votreFormule')}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><h2>{t('tp.vosBoutiques')}</h2><p className="panel-sub">{t('tp.vosBoutiquesSous')}</p></div>
          <span className="badge info">{data.boutiques.length}</span>
        </div>
        {data.boutiques.length === 0 ? <Empty title={t('tp.aucuneBoutique')} /> : (
          <ul className="shop-grid">
            {data.boutiques.map((boutique, i) => (
              <li key={boutique.id} className="shop-card" style={{ ['--i' as string]: i } as React.CSSProperties}>
                <div className="shop-top"><span className="shop-mark" aria-hidden="true" /><strong className="grow ellipsis">{boutique.nom}</strong><StatusBadge status={boutique.statut} /></div>
                <div className="muted-s shop-line"><LuMapPin /> {boutique.adresse ?? t('tp.adresseInconnue')}</div>
                <div className="muted-s shop-line"><LuPhone /> {boutique.telephone ?? t('tp.telephoneInconnu')}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>{t('tp.factures')}</h2><p className="panel-sub">{t('tp.facturesSous')}</p></div>
          <span className="badge info">{payments.length}</span>
        </div>
        {payments.length === 0 ? (
          <Empty title={t('tp.aucunPaiement')} />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('tp.col.date')}</th><th>{t('tp.col.facture')}</th><th>{t('tp.col.formule')}</th><th className="r">{t('tp.col.montant')}</th><th>{t('tp.col.moyen')}</th><th>{t('tp.col.statut')}</th><th>{t('tp.col.documents')}</th></tr></thead>
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
                        {payment.invoice_number && <button className="btn btn-sm" type="button" onClick={() => void downloadPaymentFile(`/tenant/payments/${payment.id}/invoice`, `${payment.invoice_number}.html`)}><LuFileText /> {t('tp.facture')}</button>}
                        {payment.has_attachment && <button className="btn btn-sm" type="button" onClick={() => void downloadPaymentFile(`/tenant/payments/${payment.id}/attachment`, payment.attachment_name ?? `justificatif-${payment.id}`)}><LuPaperclip /> {t('tp.justificatif')}</button>}
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
          <h2>{t('tp.securiteTitre')}</h2>
          <ul className="trust-list">
            <li>{t('tp.securite1')}</li>
            <li>{t('tp.securite2')}</li>
            <li>{t('tp.securite3')}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
