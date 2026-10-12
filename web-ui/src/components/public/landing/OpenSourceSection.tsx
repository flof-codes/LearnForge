import { useTranslation } from 'react-i18next';
import { Cloud, Server, Check, Github } from 'lucide-react';
import { row, rowGroup, sectionInner, sectionTitle } from './styles';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

const options = [
  { key: 'cloud', icon: Cloud, color: 'text-accent-blue' },
  { key: 'selfHost', icon: Server, color: 'text-accent-green' },
] as const;

export default function OpenSourceSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="open-source" className="py-16 sm:py-24 scroll-mt-16">
      <div className={sectionInner}>
        <h2 className={`${sectionTitle} mb-8 md:mb-14`}>{t('openSource.title')}</h2>

        <div className={`${rowGroup} md:grid-cols-2`}>
          {options.map(({ key, icon: Icon, color }) => (
            <div key={key} className={row}>
              <div className="flex items-center gap-3 mb-4">
                <Icon size={22} className={color} aria-hidden="true" />
                <h3 className="text-lg font-medium text-text-primary">{t(`openSource.${key}.title`)}</h3>
              </div>
              <ul className="space-y-3">
                {(['point1', 'point2', 'point3'] as const).map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-text-muted">
                    <Check size={16} className={`shrink-0 mt-1 ${color}`} aria-hidden="true" />
                    {t(`openSource.${key}.${point}`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 md:text-center">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl border border-border text-text-primary font-medium hover:bg-bg-surface transition-colors"
          >
            <Github size={18} aria-hidden="true" />
            {t('openSource.cta')}
          </a>
        </div>
      </div>
    </section>
  );
}
