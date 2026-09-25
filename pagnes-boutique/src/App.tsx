import React, { useEffect, useState } from 'react';
import { LuChevronsLeft, LuChevronsRight, LuLayoutDashboard, LuLogOut, LuPackage, LuReceipt, LuSettings, LuShoppingCart, LuUsers } from 'react-icons/lu';
import { AppProvider, useApp } from './store';
import { UIProvider } from './components/ui';
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

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: <LuLayoutDashboard />, admin: false },
  { to: '/caisse', key: 'nav.caisse', icon: <LuShoppingCart />, admin: false },
  { to: '/stock', key: 'nav.stock', icon: <LuPackage />, admin: false },
  { to: '/ventes', key: 'nav.ventes', icon: <LuReceipt />, admin: false },
  { to: '/clients', key: 'nav.clients', icon: <LuUsers />, admin: false },
  { to: '/parametres', key: 'nav.parametres', icon: <LuSettings />, admin: true },
];

function Layout() {
  const { user, logout, db } = useApp();
  const path = useRoute();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const admin = user!.role === 'admin';
  const items = NAV.filter(n => admin || !n.admin);
  const current = items.find(n => n.to === path) ?? (NAV.find(n => n.to === path) ? null : items[0]);

  useEffect(() => { if (!current) go('/'); }, [current]);
  useEffect(() => { document.title = `${t(current?.key ?? 'nav.dashboard')} · ${db.parametres.boutique}`; }, [current, db.parametres.boutique]);

  const page = () => {
    switch (current?.to) {
      case '/caisse': return <Caisse />;
      case '/stock': return <Stock />;
      case '/ventes': return <Ventes />;
      case '/clients': return <Clients />;
      case '/parametres': return <Parametres />;
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
          <div className="me"><span className="me-name">{user!.nom}</span><span className="me-role">{t('role.' + user!.role)}</span></div>
          <button className="nav-link" onClick={logout} title={t('nav.deconnexion')}><LuLogOut /><span>{t('nav.deconnexion')}</span></button>
          <button className="nav-link" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t('nav.deplier') : t('nav.replier')}>{collapsed ? <LuChevronsRight /> : <LuChevronsLeft />}<span>{t('nav.replier')}</span></button>
        </div>
      </aside>
      <main className="main" key={current?.to}>{page()}</main>
    </div>
  );
}

function Gate() {
  const { user } = useApp();
  return user ? <Layout /> : <Login />;
}

export default function App() {
  return <AppProvider><UIProvider><Gate /></UIProvider></AppProvider>;
}
