import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FolderTree, Layers, GraduationCap, Settings, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LogoIcon from './public/LogoIcon';

export default function Sidebar() {
  const { t } = useTranslation('app');
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const isStudySession = pathname.startsWith('/dashboard/study/session');

  const links = useMemo(() => [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/dashboard/topics', icon: FolderTree, label: t('nav.topics') },
    { to: '/dashboard/cards/browse', icon: Layers, label: t('nav.cards') },
    { to: '/dashboard/study', icon: GraduationCap, label: t('nav.study') },
  ], [t]);

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

      {/* Mobile bottom tab bar — hidden during study sessions to avoid overlap with rating buttons */}
      {!isStudySession && <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-secondary shadow-[0_-1px_3px_rgba(0,0,0,0.3)] flex z-50">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
                isActive ? 'text-accent-blue' : 'text-text-muted'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/dashboard/settings"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? 'text-accent-blue' : 'text-text-muted'
            }`
          }
        >
          <Settings size={20} />
          <span>{t('nav.settings')}</span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center gap-1 py-2 text-xs text-text-muted transition-colors"
        >
          <LogOut size={20} />
          <span>{t('nav.logout')}</span>
        </button>
      </nav>}
    </>
  );
}
