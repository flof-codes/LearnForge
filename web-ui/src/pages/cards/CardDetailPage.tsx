import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCard, useDeleteCard, useResetCard } from '../../hooks/useCards';
import CardHtmlRender from '../../components/CardHtmlRender';
import TopicBreadcrumb from '../../components/TopicBreadcrumb';
import BloomBadge from '../../components/BloomBadge';
import ConfirmModal from '../../components/ConfirmModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { extractErrorMessage } from '../../utils/extractErrorMessage';
import { FSRS_STATE_LABELS, BLOOM_COLORS } from '../../types';

interface LocationState {
  cardIds?: string[];
  returnTo?: string;
}

export default function CardDetailPage() {
  const { t } = useTranslation('app');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const { data: card, isLoading } = useCard(id!);
  const deleteCard = useDeleteCard();
  const resetCard = useResetCard();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardIds = state.cardIds ?? [];
  const currentIdx = cardIds.indexOf(id!);
  const prevId = currentIdx > 0 ? cardIds[currentIdx - 1] : null;
  const nextId = currentIdx >= 0 && currentIdx < cardIds.length - 1 ? cardIds[currentIdx + 1] : null;

  const ratingLabels = ['', t('ratings.again'), t('ratings.hard'), t('ratings.good'), t('ratings.easy')];

  if (isLoading) return <LoadingSpinner />;
  if (!card) return <p className="text-text-muted">{t('cardDetail.notFound')}</p>;

  const handleDelete = () => {
    setError(null);
    deleteCard.mutate(id!, {
      onSuccess: () => navigate('/dashboard/cards/browse'),
      onError: (err) => { setDeleteOpen(false); setError(extractErrorMessage(err) || t('errors.deleteCardFailed')); },
    });
  };

  const handleReset = () => {
    setError(null);
    resetCard.mutate(id!, {
      onSuccess: () => setResetOpen(false),
      onError: (err) => { setResetOpen(false); setError(extractErrorMessage(err) || t('errors.resetCardFailed')); },
    });
  };

  const goToCard = (targetId: string) => {
    navigate(`/dashboard/cards/${targetId}`, { state, replace: true });
  };

  const fsrs = card.fsrsState;
  const bloom = card.bloomState;

  return (
    <div className="space-y-6">
      <TopicBreadcrumb topicId={card.topicId} />

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm bg-danger/15 text-danger">
          {error}
        </div>
      )}

      {/* Top bar: back + prev/next + actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
          <ChevronLeft size={16} /> {t('common.back')}
        </button>

        <div className="flex items-center gap-2">
          {cardIds.length > 1 && (
            <>
              <button
                onClick={() => prevId && goToCard(prevId)}
                disabled={!prevId}
                className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('cardDetail.previousCard')}
              >
                <ArrowLeft size={16} />
              </button>
              <span className="text-xs text-text-muted tabular-nums">
                {currentIdx + 1} / {cardIds.length}
              </span>
              <button
                onClick={() => nextId && goToCard(nextId)}
                disabled={!nextId}
                className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('cardDetail.nextCard')}
              >
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <Link to={`/dashboard/cards/${id}/edit`} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-accent-blue transition-colors" title={t('cardDetail.editCard')}>
            <Pencil size={16} />
          </Link>
          <button onClick={() => setResetOpen(true)} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-warning transition-colors" title={t('cardDetail.resetProgress')}>
            <RotateCcw size={16} />
          </button>
          <button onClick={() => setDeleteOpen(true)} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-danger transition-colors" title={t('cardDetail.deleteCard')}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Card content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.front')}</h2>
          <CardHtmlRender html={card.frontHtml} interactive />
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.back')}</h2>
          <CardHtmlRender html={card.backHtml} interactive />
        </div>
      </div>

      {/* Concept */}
      <div className="bg-bg-secondary rounded-xl border border-border p-5">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.concept')}</h2>
        <p className="text-sm text-text-primary">{card.concept}</p>
        <div className="flex items-center gap-2 mt-3">
          {bloom && <BloomBadge level={bloom.currentLevel} />}
          {card.tags.map(tag => (
            <span key={tag} className="text-xs text-text-muted bg-bg-surface px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>

      {/* State info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bloom && (
          <div className="bg-bg-secondary rounded-xl border border-border p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.bloomState')}</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">{t('cardDetail.currentLevel')}</span>
                <span style={{ color: BLOOM_COLORS[bloom.currentLevel]?.text }}>{t(BLOOM_COLORS[bloom.currentLevel]?.labelKey)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">{t('cardDetail.highestReached')}</span>
                <span style={{ color: BLOOM_COLORS[bloom.highestReached]?.text }}>{t(BLOOM_COLORS[bloom.highestReached]?.labelKey)}</span>
              </div>
            </div>
          </div>
        )}
        {fsrs && (
          <div className="bg-bg-secondary rounded-xl border border-border p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.fsrsState')}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.state')}</span><span>{t(FSRS_STATE_LABELS[fsrs.state as number] ?? 'fsrs.unknown')}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.dueDate')}</span><span>{new Date(fsrs.due).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.stability')}</span><span>{fsrs.stability.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.difficulty')}</span><span>{fsrs.difficulty.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.reviews')}</span><span>{fsrs.reps}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t('cardDetail.lapses')}</span><span>{fsrs.lapses}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Review history */}
      {card.reviews && card.reviews.length > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('cardDetail.reviewHistory')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-4">{t('cardDetail.date')}</th>
                  <th className="text-left py-2 pr-4">{t('cardDetail.bloomLevel')}</th>
                  <th className="text-left py-2 pr-4">{t('cardDetail.rating')}</th>
                  <th className="text-left py-2 pr-4">{t('cardDetail.question')}</th>
                  <th className="text-left py-2">{t('cardDetail.answer')}</th>
                </tr>
              </thead>
              <tbody>
                {card.reviews.map((review, i) => {
                  const isExpanded = expandedRow === i;
                  return (
                    <tr
                      key={review.id ?? i}
                      className="border-b border-border/50 cursor-pointer hover:bg-bg-surface/50 transition-colors"
                      onClick={() => setExpandedRow(isExpanded ? null : i)}
                    >
                      <td className="py-2 pr-4 align-top">{new Date(review.reviewedAt).toLocaleString()}</td>
                      <td className="py-2 pr-4 align-top"><BloomBadge level={review.bloomLevel} /></td>
                      <td className="py-2 pr-4 align-top">
                        <span className={`font-medium ${
                          review.rating >= 3 ? 'text-accent-green' : review.rating === 2 ? 'text-warning' : 'text-danger'
                        }`}>
                          {ratingLabels[review.rating]}
                        </span>
                      </td>
                      <td className={`py-2 pr-4 text-text-muted ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate max-w-[200px]'}`}>
                        {review.questionText}
                      </td>
                      <td className={`py-2 text-text-muted ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate max-w-[200px]'}`}>
                        {review.userAnswer ?? '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={resetOpen}
        title={t('cardDetail.resetTitle')}
        message={t('cardDetail.resetMessage')}
        confirmLabel={t('cardDetail.resetConfirm')}
        danger
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        title={t('cardDetail.deleteTitle')}
        message={t('cardDetail.deleteMessage')}
        confirmLabel={t('cardDetail.deleteConfirm')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
