import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

/**
 * Shown across the dashboard while the account's address is unconfirmed.
 * Until it is, the API rejects every write with EMAIL_NOT_VERIFIED, so this is
 * the only place that explains why the app looks read-only.
 */
export default function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const { t, i18n } = useTranslation('common');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setError('');
    setState('sending');
    try {
      const { data } = await authService.requestEmailVerification(i18n.language);
      if (data.already_verified) {
        await refreshUser();
        return;
      }
      setState('sent');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('verifyBanner.resendFailed'));
      setState('idle');
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <MailWarning size={18} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <p className="text-sm text-text-primary">{t('verifyBanner.title', { email: user.email })}</p>
          <p className="text-xs text-text-muted">
            {state === 'sent' ? t('verifyBanner.resent') : error || t('verifyBanner.hint')}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={state !== 'idle'}
        className="shrink-0 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'sending' ? t('verifyBanner.sending') : t('verifyBanner.resend')}
      </button>
    </div>
  );
}
