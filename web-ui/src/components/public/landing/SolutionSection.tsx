import { useTranslation } from 'react-i18next';
import { Shuffle, Layers, Timer } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

const points = [
  { key: 'point1', icon: Shuffle, color: 'text-bloom-0-text', bg: 'bg-bloom-0-bg' },
  { key: 'point2', icon: Layers, color: 'text-bloom-3-text', bg: 'bg-bloom-3-bg' },
  { key: 'point3', icon: Timer, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
] as const;

export default function SolutionSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="py-20 sm:py-28">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary">
            {t('solution.title')}
          </h2>
          <p className="mt-4 text-text-muted max-w-2xl mx-auto leading-relaxed">
            {t('solution.lead')}
          </p>
        </div>

        <div className="space-y-8">
          {points.map(({ key, icon: Icon, color, bg }) => (
            <div key={key} className="flex items-start gap-5">
              <div className={`shrink-0 w-12 h-12 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                <Icon size={24} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-text-primary mb-1">
                  {t(`solution.${key}.title`)}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {t(`solution.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
