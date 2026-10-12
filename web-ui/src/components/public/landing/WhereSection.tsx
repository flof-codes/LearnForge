import { useTranslation } from 'react-i18next';
import { MessagesSquare, Smartphone, Check } from 'lucide-react';
import { row, rowGroup, sectionInner, sectionLead, sectionTitle } from './styles';

const places = [
  { key: 'chat', icon: MessagesSquare, color: 'text-accent-purple' },
  { key: 'app', icon: Smartphone, color: 'text-accent-blue' },
] as const;

export default function WhereSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="cost" className="py-16 sm:py-24 scroll-mt-16">
      <div className={sectionInner}>
        <div className="mb-8 md:mb-14">
          <h2 className={sectionTitle}>{t('where.title')}</h2>
          <p className={sectionLead}>{t('where.lead')}</p>
        </div>

        <div className={`${rowGroup} md:grid-cols-2`}>
          {places.map(({ key, icon: Icon, color }) => (
            <div key={key} className={row}>
              <div className="flex items-center gap-3 mb-4">
                <Icon size={22} className={color} aria-hidden="true" />
                <h3 className="text-lg font-medium text-text-primary">{t(`where.${key}.title`)}</h3>
              </div>
              <ul className="space-y-3">
                {(t(`where.${key}.points`, { returnObjects: true }) as string[]).map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-text-muted leading-relaxed">
                    <Check size={16} className={`shrink-0 mt-1 ${color}`} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
