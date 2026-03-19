import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';
import LogoIcon from '../LogoIcon';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

export default function HeroSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="lf-hero-gradient py-24 sm:py-32 lg:py-40">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-4 mb-8">
          <LogoIcon size={64} />
          <span className="text-6xl sm:text-7xl font-bold text-text-primary tracking-tight">
            LearnForge
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-text-primary tracking-tight leading-tight">
          {t('hero.hook')}
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
          {t('hero.subtitle')}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="px-8 py-3.5 rounded-xl bg-accent-blue text-white font-medium text-base hover:opacity-90 transition-opacity lf-cta-glow"
          >
            {t('hero.ctaPrimary')}
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-border text-text-primary font-medium text-base hover:bg-bg-surface transition-colors"
          >
            <Github size={18} />
            {t('hero.ctaGithub')}
          </a>
        </div>
      </div>

      {/* Screenshot in browser frame */}
      <div className="max-w-4xl mx-auto px-6 mt-16">
        <div className="rounded-xl border border-border overflow-hidden shadow-2xl lf-glow">
          <div className="bg-bg-surface h-8 flex items-center px-3 gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <span className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <img
            src="/screenshots/dashboard.png"
            alt="LearnForge dashboard showing spaced repetition study progress with Bloom's Taxonomy levels"
            className="w-full bg-bg-primary"
          />
        </div>
      </div>
    </section>
  );
}
