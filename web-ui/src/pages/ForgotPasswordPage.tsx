import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import AuthShell from '../components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t, i18n } = useTranslation('common');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authService.requestPasswordReset(email, i18n.language);
    } catch {
      // The endpoint answers 200 whether or not the address exists, so there is
      // nothing meaningful to show on failure either — never hint at which it was.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <AuthShell subtitle={t('forgotPassword.subtitle')}>
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck size={36} className="text-accent-green" />
          <p className="text-text-primary text-sm">{t('forgotPassword.sent')}</p>
          <p className="text-text-muted text-xs">{t('forgotPassword.sentHint')}</p>
          <Link
            to="/login"
            className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-center"
          >
            {t('auth.signIn')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle={t('forgotPassword.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="forgot-email" className="block text-sm text-text-muted mb-1">
            {t('auth.email')}
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
            autoFocus
            autoComplete="email"
            className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t('forgotPassword.sending') : t('forgotPassword.submit')}
        </button>

        <p className="text-center text-text-muted text-sm">
          <Link to="/login" className="text-accent-blue hover:underline">
            {t('forgotPassword.backToLogin')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
