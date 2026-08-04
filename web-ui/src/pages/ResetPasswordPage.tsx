import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import AuthShell from '../components/auth/AuthShell';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) return setError(t('resetPassword.tooShort'));
    if (password !== confirm) return setError(t('resetPassword.mismatch'));
    if (!token) return setError(t('resetPassword.missingToken'));

    setLoading(true);
    try {
      await authService.confirmPasswordReset(token, password);
      setDone(true);
      // The old session (if any) still holds a token signed before the change;
      // sending them through login keeps the credential they just set authoritative.
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('resetPassword.failed'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell subtitle={t('resetPassword.subtitle')}>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={36} className="text-accent-green" />
          <p className="text-text-primary text-sm">{t('resetPassword.success')}</p>
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
    <AuthShell subtitle={t('resetPassword.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">{error}</div>}

        <div className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-sm text-text-muted mb-1">
              {t('resetPassword.newPassword')}
            </label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordHint')}
              autoFocus
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block text-sm text-text-muted mb-1">
              {t('resetPassword.confirmPassword')}
            </label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('resetPassword.confirmPassword')}
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t('resetPassword.saving') : t('resetPassword.submit')}
        </button>

        <p className="text-center text-text-muted text-sm">
          <Link to="/forgot-password" className="text-accent-blue hover:underline">
            {t('resetPassword.requestNew')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
