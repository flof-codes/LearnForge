import { useEffect, useRef, useState } from 'react';
import { Check, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardHtmlRender from '../../components/CardHtmlRender';
import RatingButtons from '../../components/RatingButtons';
import { useIsPhone } from '../../hooks/useIsPhone';
import { tutorService } from '../../api/tutor';
import TermText from './TermText';
import MicButton from './MicButton';
import { BottomBar, barButton, primaryButton, type QuestionAnswer } from './QuestionCard';
import { dictationSupported } from '../../hooks/useDictation';
import { suggestedRating, FOLLOW_UP_LIMIT } from '../../utils/tutor';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { OpenGrade, TutorQuestion } from '../../types';

interface Props {
  item: Extract<TutorQuestion, { form: 'open' }>;
  onAnswer: (answer: QuestionAnswer) => void;
  onViewDetail?: () => void;
  saving?: boolean;
  /** The session allows dictation: show the microphone where the browser can listen. */
  dictate?: boolean;
}

interface Message { role: 'user' | 'assistant'; text: string }

const field = 'flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-bg-secondary border border-border text-text-primary focus:outline-none focus:border-accent-blue';

/**
 * An open question: the learner answers in their own words, the answer is
 * graded against the question's key points, and they may ask about it before
 * rating. Only the rating writes the review.
 */
export default function OpenCard({ item, onAnswer, onViewDetail, saving, dictate }: Props) {
  const { t } = useTranslation('app');
  const isPhone = useIsPhone();
  const { payload } = item;
  const [text, setText] = useState('');
  const [grade, setGrade] = useState<OpenGrade | null>(null);
  const [dontKnow, setDontKnow] = useState(false);
  const [busy, setBusy] = useState<'grade' | 'ask' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [followUp, setFollowUp] = useState('');
  const [lookedUp, setLookedUp] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const done = grade !== null || dontKnow;
  const correctness = grade?.correctness ?? 0;
  const asked = thread.filter(m => m.role === 'user').length;
  const mic = !!dictate && dictationSupported();

  // Keep the newest part of the thread in view.
  useEffect(() => {
    if (done) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [done, thread.length, busy]);

  const send = async () => {
    const answer = text.trim();
    if (!answer || busy) return;
    setBusy('grade');
    setError(null);
    try {
      setGrade((await tutorService.grade(item.questionId, answer)).data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const ask = async () => {
    const question = followUp.trim();
    if (!question || busy || !grade) return;
    const next: Message[] = [...thread, { role: 'user', text: question }];
    setThread(next);
    setFollowUp('');
    setBusy('ask');
    setError(null);
    try {
      const full: Message[] = [{ role: 'user', text: text.trim() }, { role: 'assistant', text: grade.feedback }, ...next];
      const reply = (await tutorService.followUp(item.questionId, full)).data.text;
      setThread([...next, { role: 'assistant', text: reply }]);
    } catch (err) {
      // The question stays out of the thread so the next one still alternates.
      setThread(thread);
      setFollowUp(question);
      setError(extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const submit = (rating: 1 | 2 | 3 | 4) => onAnswer(dontKnow ? { dontKnow: true, rating } : { text: text.trim(), rating });
  const suggestion = suggestedRating(correctness, lookedUp);
  const verdictKey = dontKnow ? 'notAnswered' : correctness >= 0.95 ? 'right' : correctness >= 0.8 ? 'mostly' : correctness >= 0.5 ? 'partly' : 'wrong';
  const verdictTone = correctness >= 0.8 ? 'text-accent-green' : correctness >= 0.5 ? 'text-warning' : 'text-danger';
  const block = 'lf-bleed px-4 py-3 border-t border-border space-y-1.5 md:mx-0 md:px-0';
  const who = 'text-[10px] uppercase tracking-wider text-text-muted';

  return (
    <>
      <div className="space-y-4 pb-48 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6 md:pb-6 md:mb-48">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">{t('tutor.openQuestion')}</div>
          {onViewDetail && (
            <button onClick={onViewDetail} className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors" title={t('study.viewDetails')}>
              <Info size={14} /> {t('study.details')}
            </button>
          )}
        </div>

        <div className="text-lg font-medium leading-snug">
          <TermText text={payload.stem} terms={payload.terms} onLookup={() => { if (!done) setLookedUp(true); }} />
        </div>

        {!done && busy !== 'grade' && (
          <p className="text-sm text-text-muted">{t(dictate && !mic ? 'tutor.openHintKeyboardMic' : mic ? 'tutor.openHintMic' : 'tutor.openHint')}</p>
        )}

        {(grade || busy === 'grade') && (
          <div className={`${block} bg-accent-blue/10 md:px-4 md:rounded-lg md:border-0`}>
            <div className={who}>{t('tutor.yourAnswerLabel')}</div>
            <p className="whitespace-pre-wrap">{text.trim()}</p>
          </div>
        )}

        {busy === 'grade' && (
          <div className={block} aria-busy="true">
            <div className={who}>{t('tutor.tutor')}</div>
            <div className="h-4 w-9/12 rounded bg-bg-surface animate-pulse" />
            <div className="h-4 w-6/12 rounded bg-bg-surface animate-pulse" />
            <p className="text-sm text-text-muted">{t('tutor.checking')}</p>
          </div>
        )}

        {done && (
          <div className={block}>
            <div className={who}>{t('tutor.tutor')}</div>
            <p className={`font-semibold ${dontKnow ? 'text-danger' : verdictTone}`}>
              {t(`tutor.${verdictKey}`)}
              {grade && <span className="font-normal text-sm text-text-muted ml-2 tabular-nums">{Math.round(correctness * 100)} %</span>}
            </p>
            {grade && <p>{grade.feedback}</p>}
            {grade && (
              <ul className="space-y-1 text-[15px]">
                {grade.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {p.met
                      ? <Check size={16} className="shrink-0 mt-1 text-accent-green" aria-label={t('tutor.pointMet')} />
                      : <X size={16} className="shrink-0 mt-1 text-danger" aria-label={t('tutor.pointMissing')} />}
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {(dontKnow || showModel) && (
              <p className="text-[15px]"><span className="text-text-muted">{t('tutor.modelAnswer')} </span>{payload.answer}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {grade && !showModel && (
                <button type="button" onClick={() => setShowModel(true)} className="text-sm px-3 py-1 rounded-full border border-border hover:bg-bg-hover transition-colors">{t('tutor.showModel')}</button>
              )}
              {!showBack && (
                <button type="button" onClick={() => setShowBack(true)} className="text-sm px-3 py-1 rounded-full border border-border hover:bg-bg-hover transition-colors">{t('tutor.showBack')}</button>
              )}
            </div>
            {showBack && (
              <div className="pt-2">
                <div className={`${who} mb-2`}>{t('study.back')}</div>
                <CardHtmlRender html={item.backHtml} interactive flat={isPhone} />
              </div>
            )}
          </div>
        )}

        {thread.map((m, i) => (
          <div key={i} className={`${block} ${m.role === 'user' ? 'bg-accent-blue/10 md:px-4 md:rounded-lg md:border-0' : ''}`}>
            <div className={who}>{m.role === 'user' ? t('tutor.you') : t('tutor.tutor')}</div>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
        {busy === 'ask' && (
          <div className={block} aria-busy="true">
            <div className={who}>{t('tutor.tutor')}</div>
            <div className="h-4 w-7/12 rounded bg-bg-surface animate-pulse" />
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={end} />
      </div>

      <BottomBar>
        {!done ? (
          <>
            <div className="flex gap-2 items-stretch">
              {mic && <MicButton value={text} onText={setText} disabled={busy !== null} />}
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                placeholder={t('tutor.yourAnswer')}
                aria-label={t('tutor.yourAnswer')}
                disabled={busy !== null}
                className={`${field} resize-none`}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDontKnow(true)} disabled={busy !== null} className={barButton}>{t('tutor.dontKnow')}</button>
              <button type="button" onClick={send} disabled={busy !== null || text.trim() === ''} className={primaryButton}>
                {busy === 'grade' ? t('tutor.checking') : t('tutor.send')}
              </button>
            </div>
          </>
        ) : (
          <>
            {grade && asked < FOLLOW_UP_LIMIT && (
              <div className="flex gap-2 items-stretch">
                {mic && <MicButton value={followUp} onText={setFollowUp} disabled={busy !== null} />}
                <input
                  value={followUp}
                  onChange={e => setFollowUp(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ask(); } }}
                  placeholder={t('tutor.askFollowUp')}
                  aria-label={t('tutor.askFollowUp')}
                  disabled={busy !== null}
                  className={field}
                />
                <button type="button" onClick={ask} disabled={busy !== null || followUp.trim() === ''} className={`${barButton} flex-none px-4`}>{t('tutor.ask')}</button>
              </div>
            )}
            <p className="text-xs text-text-muted">{t('tutor.suggested', { rating: t(`ratings.${['again', 'hard', 'good', 'easy'][suggestion - 1]}`) })}</p>
            <RatingButtons onRate={submit} disabled={saving || busy !== null} suggested={suggestion} />
          </>
        )}
      </BottomBar>
    </>
  );
}
