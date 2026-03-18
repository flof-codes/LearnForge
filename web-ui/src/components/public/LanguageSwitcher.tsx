import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('de') ? 'de' : 'en';

  return (
    <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`px-2.5 py-1.5 transition-colors ${
          current === 'en'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => i18n.changeLanguage('de')}
        className={`px-2.5 py-1.5 transition-colors ${
          current === 'de'
            ? 'bg-accent-blue/15 text-accent-blue font-medium'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        DE
      </button>
    </div>
  );
}
