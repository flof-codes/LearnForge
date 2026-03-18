import { useTranslation } from 'react-i18next';
import { Github } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

export default function CommunitySection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="lf-hero-gradient py-20 sm:py-28">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-6 text-center lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-10">
          {t('community.title')}
        </h2>

        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {(['stat1', 'stat2', 'stat3'] as const).map((key) => (
            <span
              key={key}
              className="px-5 py-2.5 rounded-full bg-bg-surface border border-border text-sm font-medium text-text-primary"
            >
              {t(`community.${key}`)}
            </span>
          ))}
        </div>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl border border-border text-text-primary font-medium text-base hover:bg-bg-surface transition-colors"
        >
          <Github size={20} />
          {t('community.cta')}
        </a>
      </div>
    </section>
  );
}
