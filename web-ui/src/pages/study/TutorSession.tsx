import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { tutorService } from '../../api/tutor';
import { reviewService } from '../../api/reviews';
import BloomBadge from '../../components/BloomBadge';
import FocusBadge from '../../components/FocusBadge';
import InteractiveCard from './InteractiveCard';
import QuestionCard, { type QuestionAnswer } from './QuestionCard';
import OpenCard from './OpenCard';
import SessionSummary from './SessionSummary';
import { presetOf, tutorErrorKey, type TutorSettings } from '../../utils/tutor';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import type { TutorItem, TutorPause } from '../../types';

interface Props {
  topicId?: string;
  settings: TutorSettings;
}

/** Ask for more once fewer than this many items are waiting behind the current one. */
const REFILL_BELOW = 3;
const POLL_MS = 1500;

const cardIdOf = (item: TutorItem) => (item.type === 'question' ? item.cardId : item.card.id);

/**
 * A study session that asks stored questions. It runs until the learner stops
 * or no card is left: the queue is refilled from the server while they answer,
 * and cards the writer has not reached yet arrive as soon as they are written.
 */
export default function TutorSession({ topicId, settings }: Props) {
  const { t } = useTranslation('app');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [queue, setQueue] = useState<TutorItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(0);
  const [paused, setPaused] = useState<TutorPause | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [ratings, setRatings] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A review that could not be saved: the card stays, with a way to try again or to leave it. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [round, setRound] = useState(0);

  const sessionId = useRef<string | null>(null);
  const fetching = useRef(false);
  const queueRef = useRef<TutorItem[]>([]);
  queueRef.current = queue;

  const refill = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      if (!sessionId.current) sessionId.current = (await tutorService.start(settings.difficulty)).data.sessionId;
      const { data } = await tutorService.next({
        sessionId: sessionId.current,
        topicId,
        answerBy: settings.answerBy,
        exclude: queueRef.current.map(cardIdOf),
      });
      setQueue(q => [...q, ...data.items.filter(item => !q.some(have => cardIdOf(have) === cardIdOf(item)))]);
      setRemaining(data.remaining);
      setPending(data.pending);
      setPaused(data.paused);
      setExhausted(data.items.length === 0 && data.pending === 0);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      fetching.current = false;
      setRound(r => r + 1);
    }
  }, [settings, topicId]);

  // Keep a few items ahead. While the writer is busy, ask again shortly; `round` restarts the wait after every answer from the server.
  useEffect(() => {
    if (ended || error || exhausted || queue.length >= REFILL_BELOW) return;
    const timer = setTimeout(() => void refill(), pending > 0 && round > 0 ? POLL_MS : 0);
    return () => clearTimeout(timer);
  }, [queue.length, pending, exhausted, ended, error, round, refill]);

  const advance = useCallback((rating: number) => {
    setRatings(r => [...r, rating]);
    setQueue(q => q.slice(1));
    setRemaining(n => Math.max(0, n - 1));
    setExhausted(false);
    queryClient.invalidateQueries({ queryKey: ['study'] });
    queryClient.invalidateQueries({ queryKey: ['cards'] });
  }, [queryClient]);

  const current = queue[0];

  const answerQuestion = async (answer: QuestionAnswer) => {
    if (!current || current.type !== 'question' || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await tutorService.answer({ questionId: current.questionId, ...answer });
      advance(answer.rating);
    } catch (err) {
      setSaveError(t(tutorErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const rateCard = async (rating: 1 | 2 | 3 | 4) => {
    if (!current || current.type !== 'card' || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await reviewService.submit({
        card_id: current.card.id,
        bloom_level: current.card.bloomState.currentLevel,
        rating,
        question_text: t('study.manualReview'),
        skip_bloom: true,
        modality: 'web',
      });
      advance(rating);
    } catch (err) {
      setSaveError(t(tutorErrorKey(err)));
    } finally {
      setSaving(false);
    }
  };

  const viewDetail = (cardId: string) => {
    navigate(`/dashboard/cards/${cardId}`, { state: { returnTo: `/dashboard/study/session${window.location.search}` } });
  };

  if (ended || (exhausted && queue.length === 0)) {
    if (ratings.length === 0) {
      return (
        <div className="max-w-md mx-auto text-center py-12">
          <p className="text-lg text-text-muted mb-4">{t('study.noCardsDueNow')}</p>
          <button onClick={() => navigate('/dashboard/study')} className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm">{t('study.backToStudy')}</button>
        </div>
      );
    }
    return <SessionSummary cardsReviewed={ratings.length} ratings={ratings} />;
  }

  const preset = presetOf(settings.difficulty);
  const headspace = preset ? t(`tutor.headspace.${preset}`) : t('tutor.headspace.custom', { value: settings.difficulty.toFixed(2) });
  const level = current ? (current.type === 'question' ? current.bloomLevel : current.card.bloomState.currentLevel) : null;
  const done = ratings.length;
  const dictate = settings.answerBy.includes('dictate');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {level !== null && <BloomBadge level={level} showLabel />}
          {current && <FocusBadge topicId={current.type === 'question' ? current.topicId : current.card.topicId} size="md" />}
          <span className="text-sm text-text-muted">{t('tutor.progress', { headspace, current: done + 1, left: Math.max(0, remaining - 1) })}</span>
        </div>
        <button onClick={() => setEnded(true)} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary shrink-0">
          <X size={16} /> {t('study.end')}
        </button>
      </div>

      <div className="h-1 bg-bg-surface rounded-full overflow-hidden">
        <div className="h-full bg-accent-blue rounded-full transition-all duration-300" style={{ width: `${(done / Math.max(1, done + remaining)) * 100}%` }} />
      </div>

      {error && (
        <div className="lf-panel md:p-4 space-y-2">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => { setError(null); void refill(); }} className="text-sm text-accent-blue">{t('tutor.retry')}</button>
        </div>
      )}

      {saveError && (
        <div className="lf-panel md:p-4 space-y-2">
          <p className="text-sm text-danger">{saveError}</p>
          <button onClick={() => { setSaveError(null); setQueue(q => q.slice(1)); setExhausted(false); }} className="text-sm text-accent-blue">{t('tutor.skipCard')}</button>
        </div>
      )}

      {paused && (
        <p className="text-sm text-warning">{t(paused === 'credits' ? 'tutor.pausedCredits' : 'tutor.pausedError')}</p>
      )}

      {!current && !error && (
        <div className="space-y-3 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6" aria-busy="true">
          <div className="h-5 w-11/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-5 w-7/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-4 w-10/12 rounded bg-bg-surface animate-pulse mt-5" />
          <div className="h-4 w-8/12 rounded bg-bg-surface animate-pulse" />
          <div className="h-4 w-9/12 rounded bg-bg-surface animate-pulse" />
          <p className="text-sm text-text-muted pt-2">{t('tutor.writing')}</p>
        </div>
      )}

      {current?.type === 'question' && current.form !== 'open' && (
        <QuestionCard key={current.questionId} item={current} onAnswer={answerQuestion} onViewDetail={() => viewDetail(current.cardId)} saving={saving} dictate={dictate} />
      )}
      {current?.type === 'question' && current.form === 'open' && (
        <OpenCard key={current.questionId} item={current} onAnswer={answerQuestion} onViewDetail={() => viewDetail(current.cardId)} saving={saving} dictate={dictate} />
      )}
      {current?.type === 'card' && (
        <InteractiveCard key={current.card.id} card={current.card} onRate={rateCard} onViewDetail={() => viewDetail(current.card.id)} disabled={saving} />
      )}
    </div>
  );
}
