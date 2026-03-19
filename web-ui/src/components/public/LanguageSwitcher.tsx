import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('de') ? 'de' : 'en';

  return (
    <div className="inline-flex items-center rounded-lg border border-border overflow-hidden text-sm">
      <button
        onClick={() => i18n.changeLanguage('en')}
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
        onClick={() => i18n.changeLanguage('de')}
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
