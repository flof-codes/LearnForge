import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, Heart } from 'lucide-react';
import { row, rowGroup, sectionInner, sectionTitle } from './styles';

const plans = ['trial', 'monthly', 'annual'] as const;

// The container entrypoint fills an unset donation URL with "#", and only after the page was
// prerendered. So the link is decided in the browser, never in the prerendered HTML.
const donationUrl = import.meta.env.VITE_DONATION_URL;
const subscribeNever = () => () => {};
const donationInBrowser = () => Boolean(donationUrl) && donationUrl !== '#';

export default function PricingSection() {
  const { t } = useTranslation('landing');
  const hasDonation = useSyncExternalStore(subscribeNever, donationInBrowser, () => false);

  return (
    <section id="pricing" className="py-16 sm:py-24 bg-bg-secondary/50 scroll-mt-16">
      <div className={sectionInner}>
        <h2 className={`${sectionTitle} mb-8 md:mb-14`}>{t('pricing.title')}</h2>

        <div className={`${rowGroup} md:grid-cols-3`}>
          {plans.map((plan) => (
            <div key={plan} className={`${row} ${plan === 'annual' ? 'md:border-accent-blue/40!' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-medium text-text-primary">{t(`pricing.${plan}.title`)}</h3>
                {plan === 'annual' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue font-medium">
                    {t('pricing.annual.badge')}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-semibold text-text-primary">{t(`pricing.${plan}.price`)}</span>
                <span className="text-text-muted text-sm">{t(`pricing.${plan}.period`)}</span>
              </div>
              {plan !== 'trial' && <p className="text-sm text-text-muted">{t(`pricing.${plan}.billed`)}</p>}
              <ul className="space-y-2.5 mt-4">
                {(t(`pricing.${plan}.features`, { returnObjects: true }) as string[]).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-text-muted">
                    <Check
                      size={16}
                      className={`shrink-0 mt-1 ${plan === 'trial' ? 'text-accent-green' : 'text-accent-blue'}`}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 md:text-center">
          <Link
            to="/register"
            className="block sm:inline-block px-8 py-4 rounded-xl bg-accent-blue text-white font-medium text-lg text-center hover:opacity-90 transition-opacity lf-cta-glow"
          >
            {t('pricing.cta')}
          </Link>
          <p className="text-text-muted text-sm mt-4 max-w-2xl md:mx-auto">{t('pricing.aiNote')}</p>
          {hasDonation && (
            <a
              href={donationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-text-muted text-sm hover:text-text-primary transition-colors"
            >
              <Heart size={16} aria-hidden="true" />
              <span>{t('pricing.donation')}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
