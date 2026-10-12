import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';
import DemoQuestion from './DemoQuestion';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

export default function HeroSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="lf-hero-gradient pt-14 pb-16 sm:pt-24 sm:pb-24">
      <div className="max-w-4xl mx-auto px-4 md:px-6 md:text-center">
        <h1 className="text-3xl sm:text-5xl font-semibold text-text-primary tracking-tight leading-tight">
          {t('hero.hook')}
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-text-muted max-w-2xl md:mx-auto leading-relaxed">
          {t('hero.subtitle')}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row md:justify-center gap-3 sm:gap-4">
          <Link
            to="/register"
            className="px-8 py-3.5 rounded-xl bg-accent-blue text-white font-medium text-base text-center hover:opacity-90 transition-opacity lf-cta-glow"
          >
            {t('hero.ctaPrimary')}
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl border border-border text-text-primary font-medium text-base hover:bg-bg-surface transition-colors"
          >
            <Github size={18} aria-hidden="true" />
            {t('hero.ctaGithub')}
          </a>
        </div>
        <p className="mt-4 text-sm text-text-muted">{t('hero.ctaNote')}</p>
      </div>

      <div id="demo" className="max-w-2xl mx-auto px-4 md:px-6 mt-12 sm:mt-16 scroll-mt-20">
        <h2 className="text-xl sm:text-2xl font-semibold text-text-primary md:text-center">
          {t('demo.title')}
        </h2>
        <p className="mt-2 mb-5 text-text-muted md:text-center">{t('demo.lead')}</p>
        <DemoQuestion />
        <p className="mt-3 text-xs text-text-muted md:text-center">{t('demo.caption')}</p>
      </div>
    </section>
  );
}
