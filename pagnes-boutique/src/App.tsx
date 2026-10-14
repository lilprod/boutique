import React, { useEffect, useRef, useState } from 'react';
import { LuBuilding2, LuHandCoins, LuTag, LuChevronsLeft, LuChevronsRight, LuGauge, LuLayers, LuLayoutDashboard, LuPackage, LuReceipt, LuSettings, LuShoppingCart, LuUsers, LuWallet } from 'react-icons/lu';
import { AppProvider, useApp } from './store';
import { UIProvider } from './components/ui';
import { TopBar } from './components/TopBar';
import { Link, go, useRoute } from './router';
import { t } from './i18n';
import { cls } from './lib/format';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Caisse from './pages/Caisse';
import Stock from './pages/Stock';
import Ventes from './pages/Ventes';
import Clients from './pages/Clients';
import Parametres from './pages/Parametres';
import Proprietaires from './pages/Proprietaires';
import Promotions from './pages/Promotions';
import TenantPortal from './pages/TenantPortal';
import SuperAdminDashboard from './pages/SuperAdminDashboard';

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: <LuLayoutDashboard />, admin: false },
  { to: '/caisse', key: 'nav.caisse', icon: <LuShoppingCart />, admin: false },
  { to: '/stock', key: 'nav.stock', icon: <LuPackage />, admin: false },
  { to: '/ventes', key: 'nav.ventes', icon: <LuReceipt />, admin: false },
  { to: '/clients', key: 'nav.clients', icon: <LuUsers />, admin: false },
  { to: '/promotions', key: 'nav.promotions', icon: <LuTag />, admin: true },
  { to: '/proprietaires', key: 'nav.proprietaires', icon: <LuHandCoins />, admin: true, multi: true },
  { to: '/parametres', key: 'nav.parametres', icon: <LuSettings />, admin: true },
];

function Layout() {
  const { user, db, shopMode, returnToTenantPortal } = useApp();
  const path = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const admin = user!.role === 'admin' || user!.role === 'boutique_admin' || (user!.role === 'tenant_admin' && shopMode);
  // « Propriétaires » n'apparaît que si la boutique a activé l'option.
  const items = NAV.filter(n => (admin || !n.admin) && (!('multi' in n) || db.parametres.multiProprietaires));
  const current = items.find(n => n.to === path) ?? (NAV.find(n => n.to === path) ? null : items[0]);

  useEffect(() => { if (!current) go('/'); }, [current]);
  // L'entête reste monté d'une page à l'autre : on remet seulement le défilement en haut.
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [current?.to]);
  useEffect(() => { document.title = `${t(current?.key ?? 'nav.dashboard')} · ${db.parametres.boutique}`; }, [current, db.parametres.boutique]);

  const page = () => {
    switch (current?.to) {
      case '/caisse': return <Caisse />;
      case '/stock': return <Stock />;
      case '/ventes': return <Ventes />;
      case '/clients': return <Clients />;
      case '/parametres': return <Parametres />;
      case '/proprietaires': return <Proprietaires />;
      case '/promotions': return <Promotions />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className={cls('shell', collapsed && 'collapsed')}>
      <aside className="side">
        <div className="side-brand"><div className="brand-motif" aria-hidden="true" /><span className="brand-name">{db.parametres.boutique}</span></div>
        <nav aria-label={t('nav.principale')}>
          {items.map(n => (
            <Link key={n.to} to={n.to} className={cls('nav-link', current?.to === n.to && 'on')} title={t(n.key)}>{n.icon}<span>{t(n.key)}</span></Link>
          ))}
        </nav>
        <div className="side-foot">
          {user!.role === 'tenant_admin' && shopMode && <button className="nav-link" onClick={returnToTenantPortal} title={t('app.retourPortail')} aria-label={t('app.retourPortail')}><LuBuilding2 /><span>{t('app.portail')}</span></button>}
          <button className="nav-link collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t('nav.deplier') : t('nav.replier')}>{collapsed ? <LuChevronsRight /> : <LuChevronsLeft />}<span>{t('nav.replier')}</span></button>
        </div>
      </aside>
      <main className="main" ref={mainRef}>
        <TopBar notificationsPath="/notifications" espace={db.parametres.boutique} />
        <div key={current?.to}>{page()}</div>
      </main>
    </div>
  );
}

/** Espace de l'administrateur de la plateforme : les écrans sont choisis par SuperAdminDashboard selon la route. */
const SAAS_NAV = [
  { to: '/', label: 'sa.nav.pilotage', title: 'sa.v.overview.title', icon: <LuGauge /> },
  { to: '/tenants', label: 'sa.nav.entreprises', title: 'sa.v.tenants.title', icon: <LuBuilding2 /> },
  { to: '/paiements', label: 'sa.nav.paiements', title: 'sa.v.payments.title', icon: <LuWallet /> },
  { to: '/plans', label: 'sa.nav.formules', title: 'sa.v.plans.title', icon: <LuLayers /> },
];

function SaaSAdminLayout() {
  const path = useRoute();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const active = SAAS_NAV.find(n => n.to === path) ?? SAAS_NAV[0];
  useEffect(() => { document.title = `${t(active.title)} · ${t('sa.v.overview.eyebrow')}`; }, [active]);

  return (
    <div className={cls('shell', collapsed && 'collapsed')}>
      <aside className="side">
        <div className="side-brand"><div className="brand-motif" aria-hidden="true" /><span className="brand-name">{t('sa.v.overview.eyebrow')}<small>{t('app.marqueSaas')}</small></span></div>
        <nav aria-label={t('app.navConsole')}>
          {SAAS_NAV.map((n) => (
            <Link key={n.to} to={n.to} className={cls('nav-link', active.to === n.to && 'on')} title={t(n.title)}>{n.icon}<span>{t(n.label)}</span></Link>
          ))}
        </nav>
        <div className="side-foot">
          <button className="nav-link collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t('nav.deplier') : t('nav.replier')}>{collapsed ? <LuChevronsRight /> : <LuChevronsLeft />}<span>{t('nav.replier')}</span></button>
        </div>
      </aside>
      <main className="main"><TopBar notificationsPath="/super-admin/notifications" espace={t('sa.v.overview.eyebrow')} /><SuperAdminDashboard /></main>
    </div>
  );
}

function TenantSaaSLayout() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  useEffect(() => { document.title = `${t('tp.monAbonnement')} · ${t('tp.espace')}`; }, []);
  return (
    <div className={cls('shell', collapsed && 'collapsed')}>
      <aside className="side">
        <div className="side-brand"><div className="brand-motif" aria-hidden="true" /><span className="brand-name">{t('tp.espace')}<small>{t('app.espaceSous')}</small></span></div>
        <nav aria-label={t('tp.espace')}>
          <Link to="/" className="nav-link on" title={t('app.monCompteTitre')}><LuBuilding2 /><span>{t('app.monCompte')}</span></Link>
        </nav>
        <div className="side-foot">
          <button className="nav-link collapse-btn" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t('nav.deplier') : t('nav.replier')}>{collapsed ? <LuChevronsRight /> : <LuChevronsLeft />}<span>{t('nav.replier')}</span></button>
        </div>
      </aside>
      <main className="main"><TopBar notificationsPath="/tenant/notifications" espace={t('tp.espace')} /><TenantPortal /></main>
    </div>
  );
}

function Gate() {
  const { user, ready, shopMode } = useApp();
  if (!ready) return <div className="boot" role="status" aria-live="polite"><span className="boot-mark" aria-hidden="true" /><p className="muted-p">{t('app.chargement')}</p></div>;
  if (!user) return <Login />;
  if (user.role === 'super_admin') return <SaaSAdminLayout />;
  if (user.role === 'tenant_admin' && !shopMode) return <TenantSaaSLayout />;
  return <Layout />;
}

export default function App() {
  return <AppProvider><UIProvider><Gate /></UIProvider></AppProvider>;
}
