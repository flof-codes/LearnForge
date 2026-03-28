/* eslint-disable react-hooks/refs -- ref snapshot pattern for stable card list during render */
import { useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDueCards } from '../../hooks/useStudy';
import { useSubmitReview } from '../../hooks/useReviews';
import BloomBadge from '../../components/BloomBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import InteractiveCard from './InteractiveCard';
import SessionSummary from './SessionSummary';
import type { DueCard } from '../../types';

export default function StudySessionPage() {
  const { t } = useTranslation('app');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const topicId = searchParams.get('topicId') || undefined;

  const { data: dueCards, isLoading, error } = useDueCards(topicId, 50);
  const submitReview = useSubmitReview();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ nextDue: string } | null>(null);
  const [feedbackTimer, setFeedbackTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [done, setDone] = useState(false);

  // Snapshot cards on first load so background refetches don't cause flicker
  const cardsRef = useRef<DueCard[]>([]);
  if (dueCards && cardsRef.current.length === 0) {
    cardsRef.current = dueCards;
  }
  const cards = cardsRef.current;
  const currentCard = cards[currentIndex];

  const handleRate = useCallback((rating: 1 | 2 | 3 | 4) => {
    if (!currentCard || submitReview.isPending) return;

    submitReview.mutate(
      {
        card_id: currentCard.id,
        bloom_level: currentCard.bloomState.currentLevel,
        rating,
        question_text: t('study.manualReview'),
        skip_bloom: true,
        modality: 'web',
      },
      {
        onSuccess: (data) => {
          setRatings(prev => [...prev, rating]);

          setFeedback({
            nextDue: data.fsrsState.due,
          });

          // Auto-advance after 1.5s (or click to skip)
          const timer = setTimeout(() => {
            setFeedback(null);
            setFeedbackTimer(null);
            if (currentIndex + 1 >= cards.length) {
              setDone(true);
            } else {
              setCurrentIndex(prev => prev + 1);
            }
          }, 1500);
          setFeedbackTimer(timer);
        },
      }
    );
  }, [currentCard, currentIndex, cards.length, submitReview]);

  if (isLoading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-lg text-danger mb-2">{t('study.failedToLoad')}</p>
        <p className="text-sm text-text-muted mb-4">{(error as Error).message}</p>
        <button onClick={() => navigate('/dashboard/study')} className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm">
          {t('study.backToStudy')}
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-lg text-text-muted mb-4">{t('study.noCardsDueNow')}</p>
        <button onClick={() => navigate('/dashboard/study')} className="px-4 py-2 rounded-lg bg-accent-blue text-white text-sm">
          {t('study.backToStudy')}
        </button>
      </div>
    );
  }

  if (done) {
    return <SessionSummary cardsReviewed={ratings.length} ratings={ratings} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BloomBadge level={currentCard.bloomState.currentLevel} />
          <span className="text-sm text-text-muted">{t('study.cardOf', { current: currentIndex + 1, total: cards.length })}</span>
        </div>
        <button
          onClick={() => setDone(true)}
          className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <X size={16} /> {t('study.end')}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-blue rounded-full transition-all duration-300"
          style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <InteractiveCard
        card={currentCard}
        onRate={handleRate}
        onViewDetail={() => {
          const params = new URLSearchParams();
          if (topicId) params.set('topicId', topicId);
          navigate(`/dashboard/cards/${currentCard.id}`, {
            state: { returnTo: `/dashboard/study/session?${params.toString()}` },
          });
        }}
        disabled={submitReview.isPending || !!feedback}
      />

      {/* Feedback overlay — click to skip */}
      {feedback && (
        <div
          className="bg-bg-secondary rounded-xl border border-border p-5 text-center space-y-2 cursor-pointer hover:bg-bg-surface transition-colors"
          onClick={() => {
            if (feedbackTimer) clearTimeout(feedbackTimer);
            setFeedback(null);
            setFeedbackTimer(null);
            if (currentIndex + 1 >= cards.length) {
              setDone(true);
            } else {
              setCurrentIndex(prev => prev + 1);
            }
          }}
        >
          <p className="text-xs text-text-muted">
            {t('study.nextReview', { date: new Date(feedback.nextDue).toLocaleDateString() })}
          </p>
          <p className="text-xs text-text-muted opacity-60">{t('study.clickToContinue')}</p>
        </div>
      )}
    </div>
  );
}
