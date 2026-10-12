import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { sectionTitle } from './styles';

export interface FaqItem {
  q: string;
  a: string;
}

// The same items feed the FAQPage JSON-LD in LandingPage, so markup and page stay in step.
export default function FaqSection() {
  const { t } = useTranslation('landing');
  const items = t('faq.items', { returnObjects: true }) as FaqItem[];

  return (
    <section id="faq" className="py-16 sm:py-24 bg-bg-secondary/50 scroll-mt-16">
      <div className="max-w-3xl mx-auto px-4 md:px-6">
        <h2 className={`${sectionTitle} mb-8 md:mb-14`}>{t('faq.title')}</h2>

        <div className="lf-bleed bg-bg-secondary border-y border-border divide-y divide-border md:rounded-xl md:border md:overflow-hidden">
          {items.map(({ q, a }) => (
            <details key={q} className="group">
              <summary className="flex items-center justify-between gap-4 px-4 py-4 md:px-6 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-text-primary font-medium">
                {q}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-text-muted transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-4 pb-4 md:px-6 md:pb-5 text-sm text-text-muted leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
