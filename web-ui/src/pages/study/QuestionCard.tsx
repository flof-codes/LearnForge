import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardHtmlRender from '../../components/CardHtmlRender';
import RatingButtons from '../../components/RatingButtons';
import { useIsPhone } from '../../hooks/useIsPhone';
import TermText from './TermText';
import MicButton from './MicButton';
import { OPTION_LETTERS, gradeChoice, gradeGap, suggestedRating } from '../../utils/tutor';
import type { TutorQuestion } from '../../types';

export interface QuestionAnswer {
  selected?: string[];
  text?: string;
  dontKnow?: boolean;
  rating: 1 | 2 | 3 | 4;
}

interface Props {
  item: Exclude<TutorQuestion, { form: 'open' }>;
  onAnswer: (answer: QuestionAnswer) => void;
  onViewDetail?: () => void;
  saving?: boolean;
  /** The session allows dictation: a gap gets a microphone where the browser can listen. */
  dictate?: boolean;
}

const GAP_MARK = '{{gap}}';

/** The bar at the bottom of the screen, same place and width as the rating buttons of a plain card. */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg-primary/90 backdrop-blur-sm border-t border-border pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] px-4 z-40">
      <div className="max-w-2xl mx-auto space-y-2">{children}</div>
    </div>
  );
}

export const barButton = 'flex-1 py-3 rounded-lg text-sm font-medium border border-border bg-bg-surface text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50';
export const primaryButton = 'flex-1 py-3 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50';

/**
 * A stored question: asked, checked on the spot, then rated. The answer goes
 * to the server only with the rating, so one tap after the feedback moves on.
 */
export default function QuestionCard({ item, onAnswer, onViewDetail, saving, dictate }: Props) {
  const { t } = useTranslation('app');
  const isPhone = useIsPhone();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [dontKnow, setDontKnow] = useState(false);
  const [lookedUp, setLookedUp] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { payload } = item;
  const correctCount = item.form === 'choice' ? item.payload.options.filter(o => o.correct).length : 1;
  const multi = correctCount > 1;
  const correctness = dontKnow ? 0 : item.form === 'choice' ? gradeChoice(item.payload, picked) : gradeGap(item.payload, text);
  const right = correctness >= 0.95;

  const pick = (i: number) => {
    if (done) return;
    if (multi) setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : [...p, i]));
    else { setPicked([i]); setDone(true); }
  };
  const check = () => {
    if (done) return;
    if (item.form === 'choice' ? picked.length === 0 : text.trim() === '') return;
    setDone(true);
  };
  const giveUp = () => { if (!done) { setDontKnow(true); setPicked([]); setDone(true); } };

  // Number keys pick an option, Enter checks. After the answer the rating buttons own the keyboard.
  const handlers = useRef({ pick, check });
  handlers.current = { pick, check }; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      // Enter on a focused button or link is that control's own key.
      if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); handlers.current.check(); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || item.form !== 'choice') return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0 && i < item.payload.options.length) { e.preventDefault(); handlers.current.pick(i); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, item]);

  useEffect(() => {
    if (item.form === 'gap' && !isPhone) inputRef.current?.focus();
  }, [item.form, isPhone]);

  const submit = (rating: 1 | 2 | 3 | 4) => {
    if (dontKnow) onAnswer({ dontKnow: true, rating });
    else if (item.form === 'choice') onAnswer({ selected: picked.map(i => OPTION_LETTERS[i]), rating });
    else onAnswer({ text, rating });
  };

  const verdict = done && (
    <p className={`font-semibold ${right ? 'text-accent-green' : 'text-danger'}`}>
      {dontKnow ? t('tutor.notAnswered') : right ? t('tutor.right') : correctness > 0 ? t('tutor.partly') : t('tutor.wrong')}
    </p>
  );

  return (
    <>
      <div className="space-y-4 pb-36 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6 md:pb-6 md:mb-36">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            {item.form === 'gap' ? t('tutor.fillGap') : t('tutor.question')}
          </div>
          {onViewDetail && (
            <button onClick={onViewDetail} className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors" title={t('study.viewDetails')}>
              <Info size={14} /> {t('study.details')}
            </button>
          )}
        </div>

        <div className="text-lg font-medium leading-snug">
          {item.form === 'gap' ? (
            <TermText
              text={payload.stem}
              terms={payload.terms}
              onLookup={() => { if (!done) setLookedUp(true); }}
              marker={GAP_MARK}
              markerNode={done
                ? <span className={`font-semibold border-b-2 px-1 ${right ? 'text-accent-green border-accent-green' : 'text-danger border-danger'}`}>{right ? text.trim() : item.payload.answer}</span>
                : <span className="font-semibold text-warning border-b-2 border-dashed border-warning px-3">…</span>}
            />
          ) : (
            <TermText text={payload.stem} terms={payload.terms} onLookup={() => { if (!done) setLookedUp(true); }} />
          )}
        </div>

        {item.form === 'choice' && multi && !done && <p className="text-sm text-text-muted">{t('tutor.severalCorrect', { count: correctCount })}</p>}
        {item.form === 'choice' && verdict}

        {item.form === 'choice' && (
          <div className="lf-bleed border-y border-border divide-y divide-border md:mx-0 md:border-0 md:divide-y-0 md:space-y-2">
            {item.payload.options.map((o, i) => {
              const isPicked = picked.includes(i);
              const state = !done ? (isPicked ? 'picked' : 'idle') : o.correct ? 'ok' : isPicked ? 'bad' : 'idle';
              const tone = { idle: '', picked: 'bg-accent-blue/10', ok: 'bg-accent-green/10', bad: 'bg-danger/10' }[state];
              const ring = { idle: 'border-border text-text-muted', picked: 'border-accent-blue text-accent-blue', ok: 'border-accent-green text-accent-green', bad: 'border-danger text-danger' }[state];
              const body = (
                <>
                  <span className={`w-6.5 h-6.5 shrink-0 rounded-full border grid place-items-center text-xs font-semibold ${ring}`}>{OPTION_LETTERS[i]}</span>
                  <span className="flex-1 min-w-0">
                    <TermText text={o.text} terms={payload.terms} active={done} />
                    {done && <span className="block text-sm text-text-muted mt-0.5">{o.why}</span>}
                  </span>
                  {state === 'ok' && <Check size={18} className="shrink-0 text-accent-green" aria-label={t('tutor.correctOption')} />}
                  {state === 'bad' && <X size={18} className="shrink-0 text-danger" aria-label={t('tutor.wrongOption')} />}
                </>
              );
              const frame = `w-full flex items-start gap-3 text-left px-4 py-3 md:rounded-lg md:border md:border-border ${tone}`;
              // Once answered the row holds term buttons of its own, so it stops being a button itself.
              return done
                ? <div key={i} className={frame}>{body}</div>
                : <button key={i} type="button" onClick={() => pick(i)} aria-pressed={isPicked} className={`${frame} md:hover:bg-bg-hover transition-colors`}>{body}</button>;
            })}
          </div>
        )}

        {item.form === 'gap' && done && (
          <>
            {verdict}
            {!right && !dontKnow && <p className="text-sm text-text-muted">{t('tutor.youWrote', { text: text.trim() })}</p>}
          </>
        )}

        {done && (
          <>
            <p><TermText text={payload.explanation} terms={payload.terms} /></p>
            {showBack ? (
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{t('study.back')}</div>
                <CardHtmlRender html={item.backHtml} interactive flat={isPhone} />
              </div>
            ) : (
              <button type="button" onClick={() => setShowBack(true)} className="text-sm px-3 py-1 rounded-full border border-border text-text-primary hover:bg-bg-hover transition-colors">
                {t('tutor.showBack')}
              </button>
            )}
          </>
        )}
      </div>

      <BottomBar>
        {done ? (
          <>
            <p className="text-xs text-text-muted">{t('tutor.suggested', { rating: t(`ratings.${['again', 'hard', 'good', 'easy'][suggestedRating(correctness, lookedUp) - 1]}`) })}</p>
            <RatingButtons onRate={submit} disabled={saving} suggested={suggestedRating(correctness, lookedUp)} />
          </>
        ) : item.form === 'gap' ? (
          <>
            <div className="flex gap-2 items-stretch">
              {dictate && <MicButton value={text} onText={setText} />}
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('tutor.yourAnswer')}
                aria-label={t('tutor.yourAnswer')}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 min-w-0 px-3 py-3 rounded-lg bg-bg-secondary border border-border text-text-primary focus:outline-none focus:border-accent-blue"
              />
              <button type="button" onClick={check} disabled={text.trim() === ''} className={`${primaryButton} flex-none px-5`}>{t('tutor.check')}</button>
            </div>
            <button type="button" onClick={giveUp} className={`${barButton} w-full py-2`}>{t('tutor.dontKnow')}</button>
          </>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={giveUp} className={barButton}>{t('tutor.dontKnow')}</button>
            {multi && (
              <button type="button" onClick={check} disabled={picked.length === 0} className={primaryButton}>
                {picked.length > 0 ? t('tutor.checkCount', { count: picked.length }) : t('tutor.check')}
              </button>
            )}
          </div>
        )}
      </BottomBar>
    </>
  );
}
