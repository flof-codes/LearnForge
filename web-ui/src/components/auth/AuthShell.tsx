import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../public/LogoIcon';

interface AuthShellProps {
  subtitle: string;
  children: ReactNode;
}

/**
 * Card shell shared by the verification and password-reset pages, matching the
 * login screen. These routes are reached from a mail link, so they are
 * deliberately noindex like the other auth screens.
 */
export default function AuthShell({ subtitle, children }: AuthShellProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center justify-center min-h-screen lf-hero-gradient">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          {t('auth.backToHome')}
        </Link>
        <div className="w-full bg-bg-secondary rounded-xl border border-border p-8 space-y-6 lf-glow">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <LogoIcon size={32} />
              <span className="text-xl font-medium text-text-primary">LearnForge</span>
            </div>
            <div className="lf-bloom-spectrum h-0.5 rounded-full w-16 mx-auto mb-3" />
            <p className="text-text-muted text-sm">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
