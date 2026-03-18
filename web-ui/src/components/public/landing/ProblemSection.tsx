import { useTranslation } from 'react-i18next';
import { RotateCcw, TrendingDown, EqualNot } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

const cards = [
  { key: 'card1', icon: RotateCcw, color: 'text-danger' },
  { key: 'card2', icon: TrendingDown, color: 'text-warning' },
  { key: 'card3', icon: EqualNot, color: 'text-text-muted' },
] as const;

export default function ProblemSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="py-20 sm:py-28 bg-bg-secondary/50">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary">
            {t('problem.title')}
          </h2>
          <p className="mt-4 text-text-muted max-w-2xl mx-auto leading-relaxed">
            {t('problem.lead')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lf-stagger">
          {cards.map(({ key, icon: Icon, color }) => (
            <div
              key={key}
              className="bg-bg-secondary rounded-xl border border-border p-8 lf-fade-in lf-visible"
            >
              <div className={`mb-4 ${color}`}>
                <Icon size={28} />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {t(`problem.${key}.title`)}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {t(`problem.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
