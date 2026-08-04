import { useTranslation } from 'react-i18next';
import { authService } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const current = i18n.language?.startsWith('de') ? 'de' : 'en';

  const select = (lang: 'de' | 'en') => {
    i18n.changeLanguage(lang);
    // Persist for whoever is signed in: Stripe webhooks fire without a request,
    // so the stored locale is the only thing billing mails can be written in.
    // Fire-and-forget — a failed write must not block the UI language change.
    if (isAuthenticated) {
      authService.updateProfile({ locale: lang }).catch(() => {});
    }
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-border overflow-hidden text-sm">
      <button
        onClick={() => select('en')}
        className={`px-4 py-2 transition-colors ${
          current === 'en'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        English
      </button>
      <span className="w-px self-stretch bg-border" />
      <button
        onClick={() => select('de')}
        className={`px-4 py-2 transition-colors ${
          current === 'de'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        Deutsch
      </button>
    </div>
  );
}
