import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Copy, Check, AlertTriangle, Trash2, Globe, Sun, Moon, MonitorSmartphone, CreditCard, CheckCircle, XCircle, Heart, Download, User } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { authService, billingService } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import ConfirmModal from '../../components/ConfirmModal';
import LanguageSwitcher from '../../components/public/LanguageSwitcher';

function computeTrialDays(trialEndsAt: string | undefined | null): number {
  if (!trialEndsAt) return 0;
  const now = new Date();
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function McpSettingsPage() {
  const queryClient = useQueryClient();
  const { user, refreshUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${window.location.origin}/mcp`;

  const { t } = useTranslation(['app', 'legal']);

  const themeOptions = [
    { value: 'auto' as const, label: t('app:settings.theme.auto'), icon: MonitorSmartphone },
    { value: 'light' as const, label: t('app:settings.theme.light'), icon: Sun },
    { value: 'dark' as const, label: t('app:settings.theme.dark'), icon: Moon },
  ];

  // Billing state
  const [searchParams, setSearchParams] = useSearchParams();
  const [banner, setBanner] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<'monthly' | 'annual' | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete account state
  const navigate = useNavigate();
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => authService.deleteAccount(deletePassword),
    onSuccess: () => {
      logout();
      navigate('/login', { replace: true });
    },
    onError: (error: Error) => {
      setShowDeleteConfirm(false);
      const axErr = error as import('axios').AxiosError<{ error?: string }>;
      setDeleteError(axErr.response?.data?.error || error.message);
    },
  });

  const successParam = searchParams.get('success');
  const canceledParam = searchParams.get('canceled');

  useEffect(() => {
    if (successParam !== 'true' && canceledParam !== 'true') return;

    void Promise.resolve().then(() => {
      if (successParam === 'true') {
        setBanner({ type: 'success', message: t('app:settings.subscription.successBanner') });
        refreshUser();
      } else if (canceledParam === 'true') {
        setBanner({ type: 'canceled', message: t('app:settings.subscription.canceledBanner') });
      }
      setSearchParams({}, { replace: true });
    });
  }, [successParam, canceledParam, setSearchParams, refreshUser, t]);

  const { data: status, isLoading } = useQuery({
    queryKey: ['mcp-key-status'],
    queryFn: () => authService.getMcpKeyStatus().then(r => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => authService.generateMcpKey().then(r => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['mcp-key-status'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () => authService.revokeMcpKey(),
    onSuccess: () => {
      setNewKey(null);
      queryClient.invalidateQueries({ queryKey: ['mcp-key-status'] });
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string; current_password?: string }) =>
      authService.updateProfile(data).then(r => r.data),
    onSuccess: () => {
      refreshUser();
      setEmailPassword('');
      setProfileMessage({ type: 'success', text: t('app:settings.profile.saved') });
    },
    onError: (error: Error) => {
      const axErr = error as import('axios').AxiosError<{ error?: string }>;
      setProfileMessage({ type: 'error', text: axErr.response?.data?.error || error.message });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      authService.changePassword(data).then(r => r.data),
    onSuccess: () => {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwMessage({ type: 'success', text: t('app:settings.profile.passwordChanged') });
    },
    onError: (error: Error) => {
      const axErr = error as import('axios').AxiosError<{ error?: string }>;
      setPwMessage({ type: 'error', text: axErr.response?.data?.error || error.message });
    },
  });

  const handleProfileSave = () => {
    setProfileMessage(null);
    const data: { name?: string; email?: string; current_password?: string } = {};
    if (profileName.trim() !== user?.name) data.name = profileName.trim();
    if (profileEmail.trim().toLowerCase() !== user?.email) {
      data.email = profileEmail.trim();
      data.current_password = emailPassword;
    }
    if (!data.name && !data.email) return;
    profileMutation.mutate(data);
  };

  const handlePasswordChange = () => {
    setPwMessage(null);
    if (newPw.length < 8) {
      setPwMessage({ type: 'error', text: t('app:settings.profile.passwordTooShort') });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ type: 'error', text: t('app:settings.profile.passwordMismatch') });
      return;
    }
    passwordMutation.mutate({ current_password: currentPw, new_password: newPw });
  };

  const emailChanged = profileEmail.trim().toLowerCase() !== (user?.email ?? '');

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckout = async (plan: 'monthly' | 'annual') => {
    setCheckoutLoadingPlan(plan);
    try {
      const { data } = await billingService.createCheckout(plan);
      window.location.href = data.url;
    } catch {
      setBanner({ type: 'canceled', message: t('app:settings.subscription.checkoutFailed') });
      setCheckoutLoadingPlan(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await billingService.createPortalSession();
      window.location.href = data.url;
    } catch {
      setBanner({ type: 'canceled', message: t('app:settings.subscription.portalFailed') });
      setPortalLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('learnforge_token');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3333';
      const response = await fetch(`${baseUrl}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learnforge-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setBanner({ type: 'canceled', message: t('app:settings.export.failed') });
    } finally {
      setExporting(false);
    }
  };

  const trialDaysRemaining = computeTrialDays(user?.trialEndsAt);

  if (isLoading) {
    return <div className="p-6 text-text-muted">{t('app:settings.loading')}</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t('app:settings.title')}</h1>
        <p className="text-text-muted mt-1">{t('app:settings.subtitle')}</p>
      </div>

      {/* Stripe redirect banner */}
      {banner && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          banner.type === 'success'
            ? 'bg-green-900/20 border-green-600/30 text-green-400'
            : 'bg-yellow-900/20 border-yellow-600/30 text-yellow-400'
        }`}>
          {banner.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
          <span className="text-sm">{banner.message}</span>
        </div>
      )}

      {/* Profile */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <User size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.profile.title')}</h2>
        </div>

        {profileMessage && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            profileMessage.type === 'success'
              ? 'bg-green-900/20 text-green-400'
              : 'bg-red-900/20 text-red-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('app:settings.profile.name')}</label>
            <input
              type="text"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('app:settings.profile.email')}</label>
            <input
              type="email"
              value={profileEmail}
              onChange={e => setProfileEmail(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
          {emailChanged && (
            <div>
              <label className="block text-sm text-text-muted mb-1">
                {t('app:settings.profile.currentPassword')}
                <span className="ml-2 text-xs text-text-muted">({t('app:settings.profile.currentPasswordHint')})</span>
              </label>
              <input
                type="password"
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              />
            </div>
          )}
          <button
            onClick={handleProfileSave}
            disabled={profileMutation.isPending}
            className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {profileMutation.isPending ? t('app:settings.profile.saving') : t('app:settings.profile.save')}
          </button>
        </div>
      </section>

      {/* Change Password */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Key size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.profile.changePassword')}</h2>
        </div>

        {pwMessage && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            pwMessage.type === 'success'
              ? 'bg-green-900/20 text-green-400'
              : 'bg-red-900/20 text-red-400'
          }`}>
            {pwMessage.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('app:settings.profile.currentPassword')}</label>
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">
              {t('app:settings.profile.newPassword')}
              <span className="ml-2 text-xs text-text-muted">({t('app:settings.profile.newPasswordHint')})</span>
            </label>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">{t('app:settings.profile.confirmPassword')}</label>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-blue"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={passwordMutation.isPending || !currentPw || !newPw || !confirmPw}
            className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {passwordMutation.isPending ? t('app:settings.profile.changingPassword') : t('app:settings.profile.changePasswordButton')}
          </button>
        </div>
      </section>

      {/* Language */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.language.title')}</h2>
        </div>
        <LanguageSwitcher />
      </section>

      {/* Theme */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Sun size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.theme.title')}</h2>
        </div>
        <div className="flex items-center rounded-lg border border-border overflow-hidden w-fit">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                theme === value
                  ? 'bg-accent-blue/15 text-accent-blue font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Subscription Status */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.subscription.title')}</h2>
        </div>

        {user?.hasActiveSubscription ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
              {t('app:settings.subscription.active')}
            </span>
            <span className="text-text-muted text-sm">
              {user.subscriptionStatus === 'active' ? t('app:settings.subscription.renewsAutomatically') : user.subscriptionStatus}
            </span>
          </div>
        ) : user?.hasActiveTrial ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-blue/20 text-accent-blue">
              {t('app:settings.subscription.trial')}
            </span>
            <span className="text-text-muted text-sm">
              {t('app:settings.subscription.daysRemaining', { count: trialDaysRemaining })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-danger/20 text-danger">
              {t('app:settings.subscription.expired')}
            </span>
            <span className="text-text-muted text-sm">{t('app:settings.subscription.expiredMessage')}</span>
          </div>
        )}

        {!user?.hasActiveSubscription && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Monthly */}
              <button
                onClick={() => withdrawalConsent && handleCheckout('monthly')}
                disabled={checkoutLoadingPlan !== null || !withdrawalConsent}
                className={`rounded-lg border p-4 bg-bg-primary text-left transition-all ${
                  withdrawalConsent
                    ? 'cursor-pointer hover:border-accent-blue/50 hover:bg-bg-surface'
                    : 'opacity-60 cursor-not-allowed'
                } ${checkoutLoadingPlan === 'monthly' ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-border'}`}
              >
                <div className="text-sm font-medium text-text-primary mb-1">
                  {t('app:settings.subscription.monthly.title')}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-semibold text-text-primary">
                    {t('app:settings.subscription.monthly.price')}
                  </span>
                  <span className="text-text-muted text-sm">
                    {t('app:settings.subscription.monthly.period')}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {checkoutLoadingPlan === 'monthly' ? t('app:settings.subscription.redirecting') : t('app:settings.subscription.monthly.billed')}
                </p>
              </button>
              {/* Annual */}
              <button
                onClick={() => withdrawalConsent && handleCheckout('annual')}
                disabled={checkoutLoadingPlan !== null || !withdrawalConsent}
                className={`rounded-lg border-2 p-4 bg-bg-primary text-left transition-all ${
                  withdrawalConsent
                    ? 'cursor-pointer hover:border-accent-blue/60 hover:bg-bg-surface'
                    : 'opacity-60 cursor-not-allowed'
                } ${checkoutLoadingPlan === 'annual' ? 'border-accent-blue ring-2 ring-accent-blue/20' : 'border-accent-blue/30'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">
                    {t('app:settings.subscription.annual.title')}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue">
                    {t('app:settings.subscription.annual.badge')}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-semibold text-text-primary">
                    {t('app:settings.subscription.annual.price')}
                  </span>
                  <span className="text-text-muted text-sm">
                    {t('app:settings.subscription.annual.period')}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {checkoutLoadingPlan === 'annual' ? t('app:settings.subscription.redirecting') : t('app:settings.subscription.annual.billed')}
                </p>
              </button>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={withdrawalConsent}
                onChange={(e) => setWithdrawalConsent(e.target.checked)}
                className="mt-0.5 shrink-0 w-4 h-4 rounded border-border accent-accent-blue"
              />
              <span className="text-text-muted text-xs leading-relaxed">
                {t('legal:billing.withdrawalConsent')}
              </span>
            </label>
          </>
        )}

        {user?.hasStripeCustomer && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full py-2.5 bg-bg-primary border border-border text-text-primary rounded-lg font-medium hover:bg-bg-surface transition-colors disabled:opacity-50"
          >
            {portalLoading ? t('app:settings.subscription.redirecting') : t('app:settings.subscription.openBillingPortal')}
          </button>
        )}

        <p className="text-text-muted text-xs">
          {t('app:settings.subscription.taxNote')}
        </p>
      </section>

      {/* Donation */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Heart size={20} className="text-accent-purple" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.donation.title')}</h2>
        </div>
        <p className="text-text-muted text-sm">
          {t('app:settings.donation.description')}
        </p>
        <a
          href={import.meta.env.VITE_DONATION_URL || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-accent-blue text-sm hover:underline"
        >
          {t('app:settings.donation.link')}
        </a>
      </section>

      {/* Data Export */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Download size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.export.title')}</h2>
        </div>
        <p className="text-text-muted text-sm">
          {t('app:settings.export.description')}
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-2.5 bg-bg-primary border border-border text-text-primary rounded-lg font-medium hover:bg-bg-surface transition-colors disabled:opacity-50"
        >
          {exporting ? t('app:settings.export.exporting') : t('app:settings.export.button')}
        </button>
      </section>

      {/* Claude Web Tutorial */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.claude.title')}</h2>
        </div>
        <ol className="text-text-muted text-sm space-y-2 list-decimal list-inside">
          <li><Trans i18nKey="settings.claude.step1" ns="app" components={{ 1: <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline" />, bold: <strong className="text-text-primary" /> }} /></li>
          <li><Trans i18nKey="settings.claude.step2" ns="app" components={{ bold: <strong className="text-text-primary" /> }} /></li>
          <li>{t('app:settings.claude.step3')}</li>
        </ol>
        <pre className="bg-bg-primary rounded-lg p-4 text-sm text-text-primary overflow-x-auto border border-border">{mcpUrl}</pre>
        <ol start={4} className="text-text-muted text-sm space-y-2 list-decimal list-inside">
          <li><Trans i18nKey="settings.claude.step4" ns="app" components={{ bold: <strong className="text-text-primary" /> }} /></li>
          <li>{t('app:settings.claude.step5')}</li>
          <li><Trans i18nKey="settings.claude.step6" ns="app" components={{ bold: <strong className="text-text-primary" /> }} /></li>
        </ol>
        <p className="text-text-muted text-xs">
          {t('app:settings.claude.note')}
        </p>
      </section>

      {/* Key Status */}
      <section className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Key size={20} className="text-accent-blue" />
          <h2 className="text-lg font-medium text-text-primary">{t('app:settings.apiKey.title')}</h2>
        </div>
        <p className="text-text-muted text-sm">
          {t('app:settings.apiKey.description')}
        </p>

        {status?.hasKey ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary text-sm">{t('app:settings.apiKey.keyActive')}</p>
              <p className="text-text-muted text-xs">
                {t('app:settings.apiKey.keyCreated', { date: status.createdAt ? new Date(status.createdAt).toLocaleDateString() : '?' })}
              </p>
            </div>
            <button
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              {revokeMutation.isPending ? t('app:settings.apiKey.revoking') : t('app:settings.apiKey.revoke')}
            </button>
          </div>
        ) : (
          <p className="text-text-muted text-sm">{t('app:settings.apiKey.noKey')}</p>
        )}

        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="w-full py-2.5 bg-accent-blue text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {generateMutation.isPending ? t('app:settings.apiKey.generating') : status?.hasKey ? t('app:settings.apiKey.regenerateKey') : t('app:settings.apiKey.generateKey')}
        </button>
      </section>

      {/* Show new key (only once) */}
      {newKey && (
        <section className="bg-bg-secondary rounded-xl border border-yellow-600/30 p-6 space-y-4">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle size={18} />
            <h3 className="font-medium">{t('app:settings.apiKey.saveTitle')}</h3>
          </div>
          <p className="text-text-muted text-sm">
            {t('app:settings.apiKey.saveDescription')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-bg-primary px-4 py-2.5 rounded-lg text-sm text-text-primary font-mono break-all border border-border">
              {newKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2.5 bg-bg-primary border border-border rounded-lg hover:bg-subtle-hover transition-colors"
              title={t('app:settings.apiKey.copyToClipboard')}
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} className="text-text-muted" />}
            </button>
          </div>
        </section>
      )}

      {/* Delete Account */}
      <section className="bg-bg-secondary rounded-xl border border-danger/30 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Trash2 size={20} className="text-danger" />
          <h2 className="text-lg font-medium text-danger">{t('app:settings.deleteAccount.title')}</h2>
        </div>
        <p className="text-text-muted text-sm">
          {t('app:settings.deleteAccount.description')}
        </p>
        <div className="space-y-3">
          <div>
            <label htmlFor="delete-password" className="block text-sm text-text-muted mb-1">
              {t('app:settings.deleteAccount.passwordLabel')}
            </label>
            <input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
              className="w-full px-4 py-2.5 bg-bg-primary border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-danger"
              autoComplete="current-password"
            />
          </div>
          {deleteError && (
            <p className="text-sm text-danger">{deleteError}</p>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!deletePassword || deleteMutation.isPending}
            className="w-full py-2.5 bg-danger text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleteMutation.isPending ? t('app:settings.deleteAccount.deleting') : t('app:settings.deleteAccount.button')}
          </button>
        </div>
      </section>

      <ConfirmModal
        open={showDeleteConfirm}
        title={t('app:settings.deleteAccount.confirmTitle')}
        message={t('app:settings.deleteAccount.confirmMessage')}
        confirmLabel={t('app:settings.deleteAccount.button')}
        danger
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteConfirm(false)}
      />

    </div>
  );
}
