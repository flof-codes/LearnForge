import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import AuthShell from '../components/auth/AuthShell';

type Status = 'pending' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { t } = useTranslation('common');
  const { token: authToken, refreshUser } = useAuth();

  // Derived from the URL rather than set inside the effect — a synchronous
  // setState in an effect body triggers a cascading render.
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'error');
  const [error, setError] = useState(token ? '' : t('verifyEmail.missingToken'));
  // React 18+ StrictMode mounts effects twice in dev; without this the second
  // run would burn the single-use token and report the link as invalid.
  const confirmed = useRef(false);

  useEffect(() => {
    if (confirmed.current) return;
    confirmed.current = true;

    if (!token) return;

    authService
      .confirmEmailVerification(token)
      .then(async () => {
        setStatus('success');
        // Refresh the cached profile so the banner disappears without a reload
        // when the link is opened in the session that is already signed in.
        if (authToken) await refreshUser();
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .catch((err: any) => {
        setStatus('error');
        setError(err.response?.data?.error ?? t('verifyEmail.failed'));
      });
  }, [token, t, authToken, refreshUser]);

  return (
    <AuthShell subtitle={t('verifyEmail.subtitle')}>
      {status === 'pending' && (
        <div className="flex flex-col items-center gap-3 text-text-muted text-sm">
          <Loader2 size={28} className="animate-spin text-accent-blue" />
          {t('verifyEmail.checking')}
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={36} className="text-accent-green" />
          <p className="text-text-primary text-sm">{t('verifyEmail.success')}</p>
          <Link
            to={authToken ? '/dashboard' : '/login'}
            className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-center"
          >
            {authToken ? t('verifyEmail.toDashboard') : t('auth.signIn')}
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle size={36} className="text-danger" />
          <p className="text-text-primary text-sm">{error}</p>
          <p className="text-text-muted text-xs">{t('verifyEmail.errorHint')}</p>
          <Link
            to={authToken ? '/dashboard' : '/login'}
            className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-center"
          >
            {authToken ? t('verifyEmail.toDashboard') : t('auth.signIn')}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
