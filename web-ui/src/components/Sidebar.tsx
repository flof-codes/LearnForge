import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FolderTree, Layers, GraduationCap, Star, Settings, LogOut, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LogoIcon from './public/LogoIcon';
import MobileNav from './MobileNav';

export default function Sidebar() {
  const { t } = useTranslation('app');
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const isStudySession = pathname.startsWith('/dashboard/study/session');
  const isAdmin = user?.role === 'admin';

  const links = useMemo(() => {
    const base = [
      { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
      { to: '/dashboard/topics', icon: FolderTree, label: t('nav.topics') },
      { to: '/dashboard/cards/browse', icon: Layers, label: t('nav.cards') },
      { to: '/dashboard/study', icon: GraduationCap, label: t('nav.study') },
      { to: '/dashboard/focus', icon: Star, label: t('nav.focus') },
    ];
    if (isAdmin) {
      base.push({ to: '/dashboard/admin', icon: Shield, label: t('nav.admin') });
    }
    return base;
  }, [t, isAdmin]);

  // Phone: four tabs, the rest sits behind "More".
  const { mobilePrimary, mobileSecondary } = useMemo(() => {
    const byPath = (to: string) => links.find(l => l.to === to)!;
    return {
      mobilePrimary: ['/dashboard', '/dashboard/topics', '/dashboard/study', '/dashboard/cards/browse'].map(byPath),
      mobileSecondary: [
        byPath('/dashboard/focus'),
        { to: '/dashboard/settings', icon: Settings, label: t('nav.settings') },
        ...links.filter(l => l.to === '/dashboard/admin'),
      ],
    };
  }, [links, t]);

  const handleLogout = () => {
    queryClient.clear();
    logout();
  };

  return (
    <>
      {/* Desktop sidebar — icons-only at md, full at lg */}
      <aside className="hidden md:flex flex-col md:w-16 lg:w-60 bg-bg-secondary shrink-0 transition-all overflow-y-auto">
        <div className="px-3 pt-10 pb-3 lg:px-5 lg:pt-12 lg:pb-5">
          <div className="hidden lg:flex items-center gap-2.5">
            <LogoIcon size={24} />
            <h1 className="text-lg font-medium text-text-primary tracking-tight">LearnForge</h1>
          </div>
          <div className="lg:hidden flex justify-center">
            <LogoIcon size={24} />
          </div>
        </div>
        <nav className="flex-1 p-2 lg:p-3 space-y-1">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors justify-center lg:justify-start ${
                  isActive
                    ? 'bg-subtle-active text-text-primary font-medium'
                    : 'text-text-muted hover:bg-subtle-hover hover:text-text-primary'
                }`
              }
              title={label}
            >
              <Icon size={18} />
              <span className="hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-2 lg:p-3 space-y-1">
          <NavLink
            to="/dashboard/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full justify-center lg:justify-start ${
                isActive
                  ? 'bg-subtle-active text-text-primary font-medium'
                  : 'text-text-muted hover:bg-subtle-hover hover:text-text-primary'
              }`
            }
            title={t('nav.settings')}
          >
            <Settings size={18} />
            <span className="hidden lg:inline">{t('nav.settings')}</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:bg-subtle-hover hover:text-text-primary transition-colors w-full justify-center lg:justify-start"
            title={t('nav.logout')}
          >
            <LogOut size={18} />
            <span className="hidden lg:inline">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Phone tab bar — hidden during study sessions to avoid overlap with rating buttons */}
      {!isStudySession && <MobileNav primary={mobilePrimary} secondary={mobileSecondary} onLogout={handleLogout} />}
    </>
  );
}
