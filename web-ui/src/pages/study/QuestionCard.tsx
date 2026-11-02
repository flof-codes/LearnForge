import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lightbulb, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RatingButtons from '../../components/RatingButtons';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useTextSelection } from '../../hooks/useTextSelection';
import TermText from './TermText';
import MicButton from './MicButton';
import CardMenu from './CardMenu';
import FigureView from './FigureView';
import BottomBar from './BottomBar';
import { barButton, primaryButton } from './buttons';
import { useStudyHelp, type HelpProps } from './useStudyHelp';
import { SelectionBar, SelectionPopover, DefinitionBox, RewriteNote } from './StudyHelp';
import TutorialSheet from './TutorialSheet';
import FeedbackSheet from './FeedbackSheet';
import { OPTION_LETTERS, gradeChoice, gradeGap, suggestedRating } from '../../utils/tutor';
import type { TutorQuestion } from '../../types';

export interface QuestionAnswer {
  selected?: string[];
  text?: string;
  dontKnow?: boolean;
  rating: 1 | 2 | 3 | 4;
}

interface Props extends HelpProps {
  item: Exclude<TutorQuestion, { form: 'open' }>;
  onAnswer: (answer: QuestionAnswer) => void;
  onViewDetail?: () => void;
  saving?: boolean;
  /** The session's difficulty, changed from the card's menu. */
  difficulty: number;
  onChangeDifficulty: (difficulty: number) => Promise<void>;
  /** Phone layout: the session's header row hosts the card's menu, and the label row above the question goes. */
  menuSlot?: HTMLElement | null;
  /** The session allows dictation: a gap gets a microphone where the browser can listen. */
  dictate?: boolean;
}

const GAP_MARK = '{{gap}}';

/**
 * A stored question: asked, checked on the spot, then rated. The answer goes
 * to the server only with the rating, so one tap after the feedback moves on.
 * Words in the question can be selected for a definition or a tutorial.
 */
export default function QuestionCard({ item, onAnswer, onViewDetail, saving, dictate, difficulty, onChangeDifficulty, menuSlot, menuInfo, rewrite, onRewritten }: Props) {
  const { t } = useTranslation('app');
  const isPhone = useIsPhone();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [dontKnow, setDontKnow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const help = useStudyHelp(item.questionId, done, rewrite?.used);
  const busy = menuOpen || help.sheet !== null;
  const { selection, clear } = useTextSelection(root, !busy);

  const { payload } = item;
  const terms = [...payload.terms, ...help.savedTerms];
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
    if (done || busy) return;
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
  }, [done, busy, item]);

  useEffect(() => {
    if (item.form === 'gap' && !isPhone) inputRef.current?.focus();
  }, [item.form, isPhone]);

  const submit = (rating: 1 | 2 | 3 | 4) => {
    if (dontKnow) onAnswer({ dontKnow: true, rating });
    else if (item.form === 'choice') onAnswer({ selected: picked.map(i => OPTION_LETTERS[i]), rating });
    else onAnswer({ text, rating });
  };

  const selectionActions = selection && {
    selection,
    onDefine: () => { void help.define(selection.text, selection.region); clear(); },
    onTutorial: () => { help.openTutorial(selection.text); clear(); },
  };
  const definition = (region: string) => help.lookup?.region === region && (
    <DefinitionBox
      lookup={help.lookup}
      onSave={() => void help.save()}
      onTutorial={() => help.openTutorial(help.lookup!.term)}
      onRetry={() => void help.define(help.lookup!.term, region)}
      onClose={help.closeLookup}
    />
  );

  const verdict = done && (
    <p className={`font-semibold ${right ? 'text-accent-green' : 'text-danger'}`}>
      {dontKnow ? t('tutor.notAnswered') : right ? t('tutor.right') : correctness > 0 ? t('tutor.partly') : t('tutor.wrong')}
    </p>
  );

  const menu = (
    <CardMenu
      difficulty={difficulty}
      onChangeDifficulty={onChangeDifficulty}
      card={{ frontHtml: item.frontHtml, backHtml: item.backHtml }}
      answered={done}
      onViewDetail={onViewDetail}
      onOpenChange={setMenuOpen}
      info={menuInfo}
      onFeedback={help.openFeedback}
    />
  );
  const explain = (
    <button type="button" onClick={() => help.openTutorial(null)} className={barButton}>
      <Lightbulb size={16} /> {t('tutor.help.explainQuestion')}
    </button>
  );

  return (
    <>
      <div ref={root} className="space-y-4 pb-36 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6 md:pb-6 md:mb-36">
        {menuSlot ? createPortal(menu, menuSlot) : (
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              {item.form === 'gap' ? t('tutor.fillGap') : t('tutor.question')}
            </div>
            {menu}
          </div>
        )}

        {rewrite && <RewriteNote labels={rewrite.labels} onUndo={rewrite.onUndo} busy={rewrite.busy} />}

        <div className="text-lg font-medium leading-snug" data-select-region="stem">
          {item.form === 'gap' ? (
            <TermText
              text={payload.stem}
              terms={terms}
              onLookup={help.noteLookup}
              marker={GAP_MARK}
              markerNode={done
                ? <span className={`font-semibold border-b-2 px-1 ${right ? 'text-accent-green border-accent-green' : 'text-danger border-danger'}`}>{right ? text.trim() : item.payload.answer}</span>
                : <span className="font-semibold text-warning border-b-2 border-dashed border-warning px-3">…</span>}
            />
          ) : (
            <TermText text={payload.stem} terms={terms} onLookup={help.noteLookup} />
          )}
        </div>
        {definition('stem')}

        {/* The front figure asks along; after the answer the full figure takes its place. */}
        {item.frontFigure && !(done && item.figure) && <FigureView html={item.frontFigure} />}

        {item.form === 'choice' && multi && <p className="text-sm text-text-muted">{t('tutor.severalCorrect', { count: correctCount })}</p>}

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
                  {/* Before the answer an option is a button and gives nothing away; after it, its words can be selected. */}
                  <span className="flex-1 min-w-0" {...(done ? { 'data-select-region': 'options' } : {})}>
                    <TermText text={o.text} terms={terms} active={done} onLookup={help.noteLookup} />
                  </span>
                  {/* The mark has its place from the start, so marking an answer moves nothing. */}
                  <span className="w-[18px] shrink-0">
                    {state === 'ok' && <Check size={18} className="text-accent-green" aria-label={t('tutor.correctOption')} />}
                    {state === 'bad' && <X size={18} className="text-danger" aria-label={t('tutor.wrongOption')} />}
                  </span>
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
        {definition('options')}

        {item.form === 'gap' && done && (
          <>
            {verdict}
            {!right && !dontKnow && <p className="text-sm text-text-muted">{t('tutor.youWrote', { text: text.trim() })}</p>}
          </>
        )}

        {item.form === 'choice' && done && verdict}
        {done && item.figure && <FigureView html={item.figure} />}
        {done && <p data-select-region="explanation"><TermText text={payload.explanation} terms={terms} onLookup={help.noteLookup} /></p>}
        {definition('explanation')}
        {item.form === 'choice' && done && (
          <ul className="space-y-1.5 text-sm">
            {item.payload.options.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className={`font-semibold ${o.correct ? 'text-accent-green' : picked.includes(i) ? 'text-danger' : 'text-text-muted'}`}>{OPTION_LETTERS[i]}</span>
                <span className="text-text-muted">{o.why}</span>
              </li>
            ))}
          </ul>
        )}
        {done && (
          <button type="button" onClick={() => help.openTutorial(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue">
            <Lightbulb size={16} /> {t('tutor.help.explainQuestion')}
          </button>
        )}
      </div>

      {selectionActions && !isPhone && <SelectionPopover {...selectionActions} />}

      <BottomBar>
        {selectionActions && isPhone && <SelectionBar {...selectionActions} />}
        {done ? (
          <RatingButtons onRate={submit} disabled={saving || busy} suggested={suggestedRating(correctness, help.used)} />
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
            <div className="flex gap-2">
              <button type="button" onClick={giveUp} className={`${barButton} py-2`}>{t('tutor.dontKnow')}</button>
              {explain}
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={giveUp} className={barButton}>{t('tutor.dontKnow')}</button>
            {explain}
            {multi && (
              <button type="button" onClick={check} disabled={picked.length === 0} className={primaryButton}>
                {picked.length > 0 ? t('tutor.checkCount', { count: picked.length }) : t('tutor.check')}
              </button>
            )}
          </div>
        )}
      </BottomBar>

      {help.sheet?.kind === 'tutorial' && (
        <TutorialSheet questionId={item.questionId} term={help.sheet.term} answered={done} onClose={help.closeSheet} />
      )}
      {help.sheet?.kind === 'feedback' && (
        <FeedbackSheet questionId={item.questionId} onClose={help.closeSheet} onRewritten={(r, labels) => onRewritten(r, labels, help.used)} />
      )}
    </>
  );
}
