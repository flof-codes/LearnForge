import { useTranslation } from 'react-i18next';
import { Shuffle, TrendingUp, Brain, Sparkles } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

const features = [
  {
    key: 'card1',
    icon: Shuffle,
    badgeColor: 'bg-bloom-0-bg text-bloom-0-text',
    iconColor: 'text-bloom-0-text',
  },
  {
    key: 'card2',
    icon: TrendingUp,
    badgeColor: 'bg-bloom-3-bg text-bloom-3-text',
    iconColor: 'text-bloom-3-text',
  },
  {
    key: 'card3',
    icon: Brain,
    badgeColor: 'bg-bloom-1-bg text-bloom-1-text',
    iconColor: 'text-bloom-1-text',
  },
  {
    key: 'card4',
    icon: Sparkles,
    badgeColor: 'bg-bloom-5-bg text-bloom-5-text',
    iconColor: 'text-bloom-5-text',
  },
] as const;

export default function FeaturesSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section id="features" className="py-20 sm:py-28 bg-bg-secondary/50">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-text-muted max-w-2xl mx-auto">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lf-stagger">
          {features.map(({ key, icon: Icon, badgeColor, iconColor }) => (
            <div
              key={key}
              className="bg-bg-secondary rounded-xl border border-border p-8 lf-card-glow lf-fade-in lf-visible"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={iconColor}>
                  <Icon size={24} />
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>
                  {t(`features.${key}.badge`)}
                </span>
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {t(`features.${key}.title`)}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {t(`features.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
