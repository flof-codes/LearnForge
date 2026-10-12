import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Upload, MessageSquare, PenLine, Link2 } from 'lucide-react';
import { row, rowGroup, sectionInner, sectionTitle } from './styles';

const ways = [
  { key: 'anki', icon: Upload, color: 'text-accent-blue' },
  { key: 'claude', icon: MessageSquare, color: 'text-accent-purple' },
  { key: 'editor', icon: PenLine, color: 'text-accent-green' },
  { key: 'share', icon: Link2, color: 'text-bloom-1-text' },
] as const;

export default function WaysInSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="import" className="py-16 sm:py-24 bg-bg-secondary/50 scroll-mt-16">
      <div className={sectionInner}>
        <h2 className={`${sectionTitle} mb-8 md:mb-14`}>{t('ways.title')}</h2>

        <div className={`${rowGroup} md:grid-cols-2`}>
          {ways.map(({ key, icon: Icon, color }) => (
            <div key={key} className={`${row} flex items-start gap-4`}>
              <Icon size={22} className={`shrink-0 mt-0.5 ${color}`} aria-hidden="true" />
              <div>
                <h3 className="text-lg font-medium text-text-primary mb-1">{t(`ways.${key}.title`)}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{t(`ways.${key}.description`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 md:text-center">
          <Link
            to="/register"
            className="block sm:inline-block px-8 py-3.5 rounded-xl bg-accent-blue text-white font-medium text-center hover:opacity-90 transition-opacity"
          >
            {t('hero.ctaPrimary')}
          </Link>
        </div>
      </div>
    </section>
  );
}
