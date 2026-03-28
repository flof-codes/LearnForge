import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Trans, useTranslation } from 'react-i18next';
import { authService } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import LogoIcon from '../components/public/LogoIcon';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { t: tLegal } = useTranslation('legal');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agbAccepted) {
      setError(tLegal('register.agbRequired'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await authService.register(email, password, name);
      login(data.token);
      navigate('/dashboard', { replace: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('auth.registrationFailed'));
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
          <p className="text-text-muted text-sm">{t('auth.signUpSubtitle')}</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="register-name" className="block text-sm text-text-muted mb-1">{t('auth.name')}</label>
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.name')}
              autoFocus
              autoComplete="name"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-sm text-text-muted mb-1">{t('auth.email')}</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.email')}
              autoComplete="email"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="block text-sm text-text-muted mb-1">{t('auth.password')}</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.password')}
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            <p className="text-text-muted text-xs mt-1.5">{t('auth.passwordHint')}</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agbAccepted}
              onChange={(e) => setAgbAccepted(e.target.checked)}
              className="mt-1 shrink-0 w-4 h-4 rounded border-border accent-accent-blue"
            />
            <span className="text-text-muted text-xs leading-relaxed">
              <Trans
                i18nKey="register.agbCheckbox"
                ns="legal"
                components={{
                  agbLink: <Link to="/agb" target="_blank" className="text-accent-blue hover:underline" />,
                  privacyLink: <Link to="/datenschutz" target="_blank" className="text-accent-blue hover:underline" />,
                }}
              />
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !name || !email || !password || !agbAccepted}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t('auth.signingUp') : t('auth.signUp')}
        </button>

        <p className="text-center text-text-muted text-sm">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="text-accent-blue hover:underline">{t('auth.signIn')}</Link>
        </p>
      </form>
      </div>
    </div>
  );
}
