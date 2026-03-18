import { useTranslation } from 'react-i18next';
import { MessageSquare, BarChart3, Trophy } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

const steps = [
  { key: 'step1', icon: MessageSquare, num: 1 },
  { key: 'step2', icon: BarChart3, num: 2 },
  { key: 'step3', icon: Trophy, num: 3 },
] as const;

export default function HowItWorksSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="py-20 sm:py-28">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-16">
          {t('howItWorks.title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-6 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] border-t-2 border-dashed border-border" />

          {steps.map(({ key, icon: Icon, num }) => (
            <div key={key} className="text-center relative">
              <div className="w-12 h-12 rounded-full bg-accent-blue/15 text-accent-blue flex items-center justify-center text-xl font-semibold mx-auto mb-4 relative z-10 bg-bg-primary">
                {num}
              </div>
              <div className="text-accent-blue mb-3">
                <Icon size={24} className="mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">
                {t(`howItWorks.${key}.title`)}
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {t(`howItWorks.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
