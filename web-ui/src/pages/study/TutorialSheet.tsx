import { Fragment, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tutorService } from '../../api/tutor';
import SheetFrame from './SheetFrame';
import TutorialVisual from './TutorialVisual';
import { helpErrorKey } from './useStudyHelp';
import type { Tutorial } from '../../types';

interface Props {
  questionId: string;
  /** The marked term; null for a tutorial of everything the question needs. */
  term: string | null;
  answered: boolean;
  onClose: () => void;
}

type Link = Tutorial['links'][number];
type Row = Array<{ id: string; link?: Link }>;

/** The concept map as rows: each chain of links followed from where it starts, then whatever is left over. */
function mapRows(t: Tutorial): Row[] {
  const used = new Set<Link>();
  const rows: Row[] = [];
  const starts = t.concepts.filter(c => t.links.some(l => l.from === c.id) && !t.links.some(l => l.to === c.id));
  for (const start of starts) {
    const row: Row = [{ id: start.id }];
    const seen = new Set([start.id]);
    let at = start.id;
    for (;;) {
      const next = t.links.find(l => l.from === at && !used.has(l) && !seen.has(l.to));
      if (!next) break;
      used.add(next);
      seen.add(next.to);
      row.push({ id: next.to, link: next });
      at = next.to;
    }
    rows.push(row);
  }
  for (const l of t.links) if (!used.has(l)) rows.push([{ id: l.from }, { id: l.to, link: l }]);
  const linked = new Set(t.links.flatMap(l => [l.from, l.to]));
  const loose = t.concepts.filter(c => !linked.has(c.id));
  if (loose.length > 0) rows.push(loose.map(c => ({ id: c.id })));
  return rows;
}

const effectMark = { leads: '', raises: '+', lowers: '−' } as const;

/** A tutorial with diagrams, of one marked term or of the whole question. Written once per card and kept. */
export default function TutorialSheet({ questionId, term, answered, onClose }: Props) {
  const { t } = useTranslation('app');
  const uid = useId();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['tutor', 'tutorial', questionId, term],
    queryFn: () => tutorService.tutorial(questionId, term).then(r => r.data.tutorial),
    staleTime: Infinity,
    retry: false,
  });

  const whole = term === null;
  const label = (id: string) => data?.concepts.find(c => c.id === id)?.label ?? id;
  const stepOf = (concept: string) => data?.steps.findIndex(s => s.concept === concept) ?? -1;
  const jump = (concept: string) => {
    const i = stepOf(concept);
    if (i < 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`${uid}-step-${i}`)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  };
  const back = (
    <button type="button" onClick={onClose} className="w-full py-3 rounded-lg text-sm font-medium border border-border bg-bg-surface hover:bg-bg-hover transition-colors">
      {t('tutor.help.backToQuestion')}
    </button>
  );

  return (
    <SheetFrame
      wide
      eyebrow={whole ? t('tutor.help.explainEyebrow') : t('tutor.help.tutorialFor')}
      title={term ?? t('tutor.help.explainTitle')}
      closeLabel={t('tutor.help.close')}
      onClose={onClose}
    >
      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-4 w-10/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-4 w-8/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-28 rounded-lg bg-bg-surface animate-pulse" />
          <p className="text-sm text-text-muted">{t('tutor.help.writingTutorial')}</p>
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-danger">{t(helpErrorKey(error))}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void refetch()} className="flex-1 py-3 rounded-lg text-sm font-medium bg-accent-blue text-white">{t('tutor.retry')}</button>
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-sm font-medium border border-border bg-bg-surface">{t('tutor.help.backToQuestion')}</button>
          </div>
        </div>
      ) : (
        <>
          {whole && <p className="text-sm text-text-muted">{t('tutor.help.explainLead')}</p>}
          {data.concepts.length > 0 && (
            <div className="space-y-2 p-3 rounded-lg bg-bg-secondary border border-border">
              {mapRows(data).map((row, r) => (
                <div key={r} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  {row.map(({ id, link }, i) => (
                    <Fragment key={i}>
                      {link && (
                        <span className="text-text-muted" aria-hidden="true">
                          →{effectMark[link.effect] && <b className={link.effect === 'raises' ? 'text-accent-green' : 'text-danger'}>{effectMark[link.effect]}</b>}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => jump(id)}
                        disabled={stepOf(id) < 0}
                        className="px-2.5 py-0.5 rounded-full border border-border bg-bg-primary enabled:hover:border-accent-blue enabled:hover:text-accent-blue transition-colors"
                      >
                        {label(id)}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
          )}
          {data.steps.map((s, i) => (
            <section key={i} id={`${uid}-step-${i}`} className="space-y-2 pt-3 border-t border-border scroll-mt-4">
              <h4 className="flex items-center gap-2.5 font-semibold">
                <span className="grid place-items-center w-[22px] h-[22px] shrink-0 rounded-full bg-bg-surface text-xs tabular-nums">{i + 1}</span>
                {s.title}
              </h4>
              <p className="text-[15px]">{s.text}</p>
              {s.visual && <TutorialVisual visual={s.visual} />}
            </section>
          ))}
          {!answered && <p className="text-xs text-text-muted">{t('tutor.help.cappedHard')}</p>}
          {back}
        </>
      )}
    </SheetFrame>
  );
}
