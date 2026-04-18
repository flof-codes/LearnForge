import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import LogoIcon from '../components/public/LogoIcon';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');

  const nextParam = searchParams.get('next');
  const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authService.login(email, password);
      login(data.token);
      navigate(safeNext, { replace: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen lf-hero-gradient">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4">
          <ArrowLeft size={16} />
          {t('auth.backToHome')}
        </Link>
      <form onSubmit={handleSubmit} className="w-full bg-bg-secondary rounded-xl border border-border p-8 space-y-6 lf-glow">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <LogoIcon size={32} />
            <span className="text-xl font-medium text-text-primary">LearnForge</span>
          </div>
          <div className="lf-bloom-spectrum h-0.5 rounded-full w-16 mx-auto mb-3" />
          <p className="text-text-muted text-sm">{t('auth.signInSubtitle')}</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm text-text-muted mb-1">{t('auth.email')}</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email')}
              autoFocus
              autoComplete="email"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm text-text-muted mb-1">{t('auth.password')}</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password')}
              autoComplete="current-password"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>

        <p className="text-center text-text-muted text-sm">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-accent-blue hover:underline">{t('auth.signUp')}</Link>
        </p>
      </form>
      </div>
    </div>
  );
}
