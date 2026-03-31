import { useTranslation } from 'react-i18next';
import { useFadeIn } from '../../../hooks/useFadeIn';

const levels = [
  { level: 0, width: 'w-[50%] md:w-[40%]', bg: 'bg-bloom-0-bg', border: 'border-bloom-0-text/20' },
  { level: 1, width: 'w-[60%] md:w-[50%]', bg: 'bg-bloom-1-bg', border: 'border-bloom-1-text/20' },
  { level: 2, width: 'w-[70%] md:w-[60%]', bg: 'bg-bloom-2-bg', border: 'border-bloom-2-text/20' },
  { level: 3, width: 'w-[80%] md:w-[72%]', bg: 'bg-bloom-3-bg', border: 'border-bloom-3-text/20' },
  { level: 4, width: 'w-[90%] md:w-[84%]', bg: 'bg-bloom-4-bg', border: 'border-bloom-4-text/20' },
  { level: 5, width: 'w-full md:w-[96%]', bg: 'bg-bloom-5-bg', border: 'border-bloom-5-text/20' },
] as const;

export default function BloomSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="py-20 sm:py-28 bg-bg-secondary/50">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary">
            {t('bloom.title')}
          </h2>
          <p className="mt-4 text-text-muted max-w-2xl mx-auto">
            {t('bloom.subtitle')}
          </p>
        </div>

        {/* Bloom spectrum accent line */}
        <div className="lf-bloom-spectrum h-1 rounded-full mb-10 max-w-xs mx-auto" />

        <div className="space-y-3 lf-stagger">
          {levels.map(({ level, width, bg, border }) => (
            <div
              key={level}
              className={`${width} lf-fade-in lf-visible`}
            >
              <div
                className={`flex items-center gap-4 px-5 py-3.5 rounded-xl ${bg} border ${border}`}
              >
                <span className="text-sm font-semibold text-text-primary shrink-0">
                  {level}
                </span>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-text-primary">
                    {t(`bloom.levels.${level}.name`)}
                  </span>
                  <span className="text-xs text-text-muted ml-2 hidden sm:inline">
                    {t(`bloom.levels.${level}.description`)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
