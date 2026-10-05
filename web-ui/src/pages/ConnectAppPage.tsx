import { useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { appsService } from '../api/apps';
import LogoIcon from '../components/public/LogoIcon';
import LoadingSpinner from '../components/LoadingSpinner';
import { extractErrorMessage } from '../utils/extractErrorMessage';

/**
 * The page an app (Lecture Scribe) opens in the browser to be connected: it
 * shows the same code the app shows and asks the signed-in user to approve.
 */
export default function ConnectAppPage() {
  const { t } = useTranslation('app');
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const code = (searchParams.get('code') ?? '').replace(/[\s-]/g, '').toUpperCase();
  const shownCode = code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
  const loginHref = `/login?next=${encodeURIComponent(`/connect?code=${code}`)}`;

  const pairing = useQuery({
    queryKey: ['app-pairing', code],
    queryFn: () => appsService.pairing(code).then(r => r.data),
    enabled: isAuthenticated && code.length === 6,
    retry: false,
  });
  const claim = useMutation({ mutationFn: () => appsService.claim(code).then(r => r.data) });

  const appName = claim.data?.app ?? pairing.data?.app ?? '';
  const device = claim.data?.device ?? pairing.data?.device ?? '';

  let body: React.ReactNode;
  if (authLoading || (isAuthenticated && pairing.isLoading)) {
    body = <LoadingSpinner />;
  } else if (code.length !== 6) {
    body = <p className="text-sm text-danger">{t('connect.noCode')}</p>;
  } else if (!isAuthenticated) {
    body = (
      <>
        <p className="text-sm text-text-muted">{t('connect.signInFirst')}</p>
        <div className="lf-connect-code">{shownCode}</div>
        <Link to={loginHref} className="block text-center px-5 py-2.5 bg-accent-blue text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
          {t('connect.signIn')}
        </Link>
      </>
    );
  } else if (claim.isSuccess) {
    body = (
      <>
        <h1 className="text-lg font-medium text-text-primary">{t('connect.doneTitle', { app: appName })}</h1>
        <p className="text-sm text-accent-green font-medium">{t('connect.doneBody')}</p>
        <Link to="/dashboard/settings" className="text-sm text-accent-blue hover:underline">{t('connect.manage')}</Link>
      </>
    );
  } else if (pairing.isError || pairing.data?.claimed) {
    body = (
      <>
        <h1 className="text-lg font-medium text-text-primary">{t('connect.expiredTitle')}</h1>
        <p className="text-sm text-text-muted">{t('connect.expiredBody')}</p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="text-lg font-medium text-text-primary">{t('connect.title', { app: appName })}</h1>
        {device && <p className="text-sm text-text-muted">{device}</p>}
        <p className="text-sm text-text-muted">{t('connect.compare', { app: appName })}</p>
        <div className="lf-connect-code">{shownCode}</div>
        <ul className="list-disc pl-5 text-sm text-text-muted space-y-1">
          <li>{t('connect.canRead')}</li>
          <li>{t('connect.canCreate')}</li>
        </ul>
        <p className="text-sm text-text-muted">{t('connect.cannot')}</p>
        {claim.isError && <p className="text-sm text-danger">{extractErrorMessage(claim.error)}</p>}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => claim.mutate()}
            disabled={claim.isPending}
            className="px-5 py-2.5 bg-accent-blue text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {claim.isPending ? t('connect.connecting') : t('connect.connect')}
          </button>
          <Link to="/dashboard" className="px-5 py-2.5 border border-border text-text-muted rounded-lg font-medium text-sm hover:bg-subtle-hover transition-colors">
            {t('connect.cancel')}
          </Link>
        </div>
      </>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen lf-hero-gradient">
      <Helmet>
        <title>{t('connect.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-md px-6">
        <div className="flex items-center gap-2 mb-4 text-text-primary font-medium"><LogoIcon size={22} /> LearnForge</div>
        <div className="lf-panel space-y-4">{body}</div>
      </div>
    </div>
  );
}
