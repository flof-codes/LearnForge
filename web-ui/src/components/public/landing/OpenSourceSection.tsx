import { useTranslation } from 'react-i18next';
import { Cloud, Server, Check } from 'lucide-react';
import { useFadeIn } from '../../../hooks/useFadeIn';

export default function OpenSourceSection() {
  const { t } = useTranslation('landing');
  const { ref, isVisible } = useFadeIn();

  return (
    <section className="py-20 sm:py-28">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto px-6 lf-fade-in ${isVisible ? 'lf-visible' : ''}`}
      >
        <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary text-center mb-12">
          {t('openSource.title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cloud */}
          <div className="bg-bg-secondary rounded-xl border border-border p-8 lf-card-glow">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center">
                <Cloud size={22} />
              </div>
              <h3 className="text-lg font-medium text-text-primary">
                {t('openSource.cloud.title')}
              </h3>
            </div>
            <ul className="space-y-3">
              {(['point1', 'point2', 'point3'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2.5 text-sm text-text-muted">
                  <Check size={16} className="text-accent-blue shrink-0" />
                  {t(`openSource.cloud.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          {/* Self-Host */}
          <div className="bg-bg-secondary rounded-xl border border-border p-8 lf-card-glow">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center">
                <Server size={22} />
              </div>
              <h3 className="text-lg font-medium text-text-primary">
                {t('openSource.selfHost.title')}
              </h3>
            </div>
            <ul className="space-y-3">
              {(['point1', 'point2', 'point3'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2.5 text-sm text-text-muted">
                  <Check size={16} className="text-accent-green shrink-0" />
                  {t(`openSource.selfHost.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
