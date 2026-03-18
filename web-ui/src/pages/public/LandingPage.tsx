import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import {
  Brain, Layers, Sparkles, Mail, Github,
  FunctionSquare, ListChecks, BarChart3, Search, Moon, Code2,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/flof-codes/LearnForge';

const screenshots = [
  { key: 'dashboard', src: '/screenshots/dashboard.png' },
  { key: 'study', src: '/screenshots/study-session.png' },
  { key: 'cards', src: '/screenshots/card-browser.png' },
] as const;

type ScreenshotKey = (typeof screenshots)[number]['key'];

export default function LandingPage() {
  const { t, i18n } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState<ScreenshotKey>('dashboard');
  const activeScreenshot = screenshots.find(s => s.key === activeTab)!;

  return (
    <>
      <Helmet>
        <html lang={i18n.language} />
        <title>LearnForge — {t('hero.title')}</title>
        <meta name="description" content={t('hero.subtitle')} />
        <meta property="og:title" content={`LearnForge — ${t('hero.title')}`} />
        <meta property="og:description" content={t('hero.subtitle')} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://learnforge.eu/" />
      </Helmet>

      {/* Hero */}
      <section className="lf-hero-gradient py-24 sm:py-32 lg:py-40">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-text-primary tracking-tight leading-tight">
            {t('hero.title')}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#early-access"
              className="px-8 py-3.5 rounded-xl bg-accent-blue text-white font-medium text-base hover:opacity-90 transition-opacity"
            >
              {t('hero.cta')}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl border border-border text-text-primary font-medium text-base hover:bg-bg-surface transition-colors"
            >
              <Github size={18} />
              {t('hero.github')}
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary">{t('features.sectionTitle')}</h2>
            <p className="mt-4 text-text-muted max-w-2xl mx-auto">{t('features.sectionSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Brain size={28} />}
              title={t('features.fsrs.title')}
              description={t('features.fsrs.description')}
              color="text-accent-green"
            />
            <FeatureCard
              icon={<Layers size={28} />}
              title={t('features.bloom.title')}
              description={t('features.bloom.description')}
              color="text-accent-purple"
            />
            <FeatureCard
              icon={<Sparkles size={28} />}
              title={t('features.ai.title')}
              description={t('features.ai.description')}
              color="text-accent-blue"
            />
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="py-20 sm:py-28 bg-bg-secondary/50">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-12">
            {t('screenshots.sectionTitle')}
          </h2>

          {/* Tabs */}
          <div className="flex justify-center gap-2 mb-8">
            {screenshots.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveTab(s.key)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === s.key
                    ? 'bg-accent-blue/15 text-accent-blue font-medium'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-surface'
                }`}
              >
                {t(`screenshots.${s.key}`)}
              </button>
            ))}
          </div>

          {/* Screenshot with browser frame */}
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl border border-border overflow-hidden shadow-2xl lf-glow">
              <div className="bg-bg-surface h-8 flex items-center px-3 gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <img
                src={activeScreenshot.src}
                alt={t(`screenshots.${activeTab}Desc`)}
                className="w-full bg-bg-primary"
              />
            </div>
            <p className="text-center text-sm text-text-muted mt-4">
              {t(`screenshots.${activeTab}Desc`)}
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-16">
            {t('howItWorks.sectionTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map(step => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-accent-blue/15 text-accent-blue flex items-center justify-center text-xl font-semibold mx-auto mb-4">
                  {step}
                </div>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  {t(`howItWorks.step${step}.title`)}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {t(`howItWorks.step${step}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Features Grid */}
      <section className="py-20 sm:py-28 bg-bg-secondary/50">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-12">
            {t('techFeatures.sectionTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <TechCard icon={<FunctionSquare size={20} />} title={t('techFeatures.katex.title')} desc={t('techFeatures.katex.description')} />
            <TechCard icon={<ListChecks size={20} />} title={t('techFeatures.mcq.title')} desc={t('techFeatures.mcq.description')} />
            <TechCard icon={<BarChart3 size={20} />} title={t('techFeatures.svg.title')} desc={t('techFeatures.svg.description')} />
            <TechCard icon={<Search size={20} />} title={t('techFeatures.search.title')} desc={t('techFeatures.search.description')} />
            <TechCard icon={<Moon size={20} />} title={t('techFeatures.darkTheme.title')} desc={t('techFeatures.darkTheme.description')} />
            <TechCard icon={<Code2 size={20} />} title={t('techFeatures.openSource.title')} desc={t('techFeatures.openSource.description')} />
          </div>
        </div>
      </section>

      {/* Early Access CTA */}
      <section id="early-access" className="py-20 sm:py-28">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-4">
            {t('earlyAccess.title')}
          </h2>
          <p className="text-text-muted mb-8 leading-relaxed">
            {t('earlyAccess.description')}
          </p>
          <a
            href="mailto:office@learnforge.eu?subject=LearnForge Early Access"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-accent-blue text-white font-medium text-lg hover:opacity-90 transition-opacity"
          >
            <Mail size={22} />
            {t('earlyAccess.cta')}
          </a>
          <p className="mt-4 text-sm text-text-muted">{t('earlyAccess.note')}</p>
          <p className="mt-2 text-sm text-text-muted">{t('earlyAccess.prerequisite')}</p>
        </div>
      </section>
    </>
  );
}

function FeatureCard({ icon, title, description, color }: { icon: React.ReactNode; title: string; description: string; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-xl border border-border p-8">
      <div className={`mb-4 ${color}`}>{icon}</div>
      <h3 className="text-lg font-medium text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-muted leading-relaxed">{description}</p>
    </div>
  );
}

function TechCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 bg-bg-secondary rounded-xl border border-border p-5">
      <div className="text-accent-blue shrink-0 mt-0.5">{icon}</div>
      <div>
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <p className="text-xs text-text-muted mt-1">{desc}</p>
      </div>
    </div>
  );
}
