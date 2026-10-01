import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, LogOut, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface Props {
  /** Shown as tabs. Four fit next to "More" at 375px with German labels. */
  primary: NavItem[];
  /** Shown in the sheet behind "More". */
  secondary: NavItem[];
  onLogout: () => void;
}

const tabClass = (active: boolean) =>
  `flex-1 min-w-0 flex flex-col items-center gap-1 pt-2 pb-1.5 text-xs transition-colors ${
    active ? 'text-accent-blue' : 'text-text-muted'
  }`;

export default function MobileNav({ primary, secondary, onLogout }: Props) {
  const { t } = useTranslation('app');
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const moreActive = secondary.some(({ to }) => pathname.startsWith(to));
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the sheet when it opens and back to "More" when it closes.
  useEffect(() => {
    if (!open) return;
    const moreButton = moreButtonRef.current;
    sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      moreButton?.focus();
    };
  }, [open]);

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label={t('nav.more')}
            className="relative bg-bg-secondary rounded-t-2xl pt-2 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="w-9 h-1 rounded-full bg-bg-hover mx-auto mb-1" />
            <div className="divide-y divide-border">
              {secondary.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-4 py-3.5 text-base ${isActive ? 'text-accent-blue' : 'text-text-primary'}`
                  }
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => { setOpen(false); onLogout(); }}
                className="flex items-center gap-4 px-4 py-3.5 text-base text-danger w-full"
              >
                <LogOut size={20} />
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-secondary shadow-[0_-1px_3px_rgba(0,0,0,0.3)] flex z-40 pb-[env(safe-area-inset-bottom)]">
        {primary.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => tabClass(isActive)}
          >
            <Icon size={20} />
            <span className="truncate max-w-full">{label}</span>
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={tabClass(moreActive)}
        >
          <MoreHorizontal size={20} />
          <span className="truncate max-w-full">{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
