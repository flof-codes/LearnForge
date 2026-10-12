import { useTranslation } from 'react-i18next';
import { Shuffle, Layers, MessageSquareText, Timer } from 'lucide-react';
import { row, rowGroup, sectionInner, sectionLead, sectionTitle } from './styles';

const LEVELS = [
  'bg-bloom-0-bg text-bloom-0-text',
  'bg-bloom-1-bg text-bloom-1-text',
  'bg-bloom-2-bg text-bloom-2-text',
  'bg-bloom-3-bg text-bloom-3-text',
  'bg-bloom-4-bg text-bloom-4-text',
  'bg-bloom-5-bg text-bloom-5-text',
] as const;

const chip = 'px-2.5 py-1 rounded-full bg-bg-surface text-xs font-medium text-text-primary';

export default function ReviewSection() {
  const { t } = useTranslation('landing');
  const steps = t('review.variation.steps', { returnObjects: true }) as string[];
  const stepHints = t('review.variation.stepHints', { returnObjects: true }) as string[];
  const difficulties = t('review.answers.difficulties', { returnObjects: true }) as string[];
  const modes = t('review.answers.modes', { returnObjects: true }) as string[];

  return (
    <section id="features" className="py-16 sm:py-24 scroll-mt-16">
      <div className={sectionInner}>
        <div className="mb-8 md:mb-14">
          <h2 className={sectionTitle}>{t('review.title')}</h2>
          <p className={sectionLead}>{t('review.lead')}</p>
        </div>

        <div className={`${rowGroup} md:grid-cols-2`}>
          <div className={row}>
            <Heading icon={<Shuffle size={22} aria-hidden="true" />} color="text-bloom-0-text" title={t('review.variation.title')} />
            <p className="text-sm text-text-muted leading-relaxed">{t('review.variation.description')}</p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-baseline">
              {steps.map((step, i) => (
                <div key={step} className="contents">
                  <dt><span className={chip}>{step}</span></dt>
                  <dd className="text-xs text-text-muted">{stepHints[i]}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={row}>
            <Heading icon={<Layers size={22} aria-hidden="true" />} color="text-bloom-3-text" title={t('review.levels.title')} />
            <p className="text-sm text-text-muted leading-relaxed">{t('review.levels.description')}</p>
            <ol className="mt-4 flex flex-wrap gap-2">
              {LEVELS.map((color, level) => (
                <li
                  key={level}
                  title={t(`bloom.levels.${level}.description`)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${color}`}
                >
                  {level + 1} {t(`bloom.levels.${level}.name`)}
                </li>
              ))}
            </ol>
          </div>

          <div className={row}>
            <Heading icon={<MessageSquareText size={22} aria-hidden="true" />} color="text-accent-purple" title={t('review.answers.title')} />
            <p className="text-sm text-text-muted leading-relaxed">{t('review.answers.description')}</p>
            <dl className="mt-4 space-y-2">
              <ChipLine label={t('review.answers.difficultyLabel')} items={difficulties} />
              <ChipLine label={t('review.answers.modesLabel')} items={modes} />
            </dl>
          </div>

          <div className={row}>
            <Heading icon={<Timer size={22} aria-hidden="true" />} color="text-accent-blue" title={t('review.schedule.title')} />
            <p className="text-sm text-text-muted leading-relaxed">{t('review.schedule.description')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Heading({ icon, color, title }: { icon: React.ReactNode; color: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className={color}>{icon}</span>
      <h3 className="text-lg font-medium text-text-primary">{title}</h3>
    </div>
  );
}

function ChipLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <dt className="text-xs text-text-muted w-24 shrink-0">{label}</dt>
      <dd className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className={chip}>{item}</span>
        ))}
      </dd>
    </div>
  );
}
