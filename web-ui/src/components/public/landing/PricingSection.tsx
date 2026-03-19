import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, Heart } from 'lucide-react';

export default function PricingSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="pricing" className="py-20 sm:py-28">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-12">
          {t('pricing.title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Free Trial */}
          <div className="rounded-xl border border-border p-8 bg-bg-secondary">
            <h3 className="text-lg font-medium text-text-primary mb-1">
              {t('pricing.trial.title')}
            </h3>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-semibold text-text-primary">
                {t('pricing.trial.price')}
              </span>
            </div>
            <p className="text-sm text-text-muted mb-6">{t('pricing.trial.period')}</p>
            <ul className="space-y-3 mb-6">
              {(t('pricing.trial.features', { returnObjects: true }) as string[]).map((feature, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-text-muted">
                  <Check size={16} className="text-accent-green shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Annual */}
          <div className="rounded-xl border-2 border-accent-blue/30 p-8 bg-bg-secondary lf-card-glow">
            <h3 className="text-lg font-medium text-text-primary mb-1">
              {t('pricing.annual.title')}
            </h3>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-semibold text-text-primary">
                {t('pricing.annual.price')}
              </span>
              <span className="text-text-muted text-sm">{t('pricing.annual.period')}</span>
            </div>
            <p className="text-sm text-text-muted mb-6">{t('pricing.annual.billed')}</p>
            <ul className="space-y-3 mb-6">
              {(t('pricing.annual.features', { returnObjects: true }) as string[]).map((feature, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-text-muted">
                  <Check size={16} className="text-accent-blue shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <Link
            to="/register"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-accent-blue text-white font-medium text-lg hover:opacity-90 transition-opacity lf-cta-glow"
          >
            {t('pricing.cta')}
          </Link>
          <p className="text-text-muted text-sm mt-4">{t('pricing.claudeNote')}</p>
          <a
            href={import.meta.env.VITE_DONATION_URL || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-2 text-text-muted text-sm hover:text-text-primary transition-colors"
          >
            <Heart size={16} />
            <span>{t('pricing.donation')}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
