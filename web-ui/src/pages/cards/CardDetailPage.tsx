import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { useCard, useDeleteCard, useResetCard } from '../../hooks/useCards';
import CardHtmlRender from '../../components/CardHtmlRender';
import TopicBreadcrumb from '../../components/TopicBreadcrumb';
import BloomBadge from '../../components/BloomBadge';
import ConfirmModal from '../../components/ConfirmModal';
import LoadingSpinner from '../../components/LoadingSpinner';
import { FSRS_STATE_LABELS, BLOOM_COLORS } from '../../types';

interface LocationState {
  cardIds?: string[];
  returnTo?: string;
}

export default function CardDetailPage() {
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

  const cardIds = state.cardIds ?? [];
  const currentIdx = cardIds.indexOf(id!);
  const prevId = currentIdx > 0 ? cardIds[currentIdx - 1] : null;
  const nextId = currentIdx >= 0 && currentIdx < cardIds.length - 1 ? cardIds[currentIdx + 1] : null;

  if (isLoading) return <LoadingSpinner />;
  if (!card) return <p className="text-text-muted">Card not found.</p>;

  const handleDelete = () => {
    deleteCard.mutate(id!, { onSuccess: () => navigate('/cards/browse') });
  };

  const handleReset = () => {
    resetCard.mutate(id!, { onSuccess: () => setResetOpen(false) });
  };

  const goToCard = (targetId: string) => {
    navigate(`/cards/${targetId}`, { state, replace: true });
  };

  const fsrs = card.fsrsState;
  const bloom = card.bloomState;

  return (
    <div className="space-y-6">
      <TopicBreadcrumb topicId={card.topicId} />

      {/* Top bar: back + prev/next + actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
          <ChevronLeft size={16} /> Back
        </button>

        <div className="flex items-center gap-2">
          {cardIds.length > 1 && (
            <>
              <button
                onClick={() => prevId && goToCard(prevId)}
                disabled={!prevId}
                className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous card"
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
                title="Next card"
              >
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <Link to={`/cards/${id}/edit`} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-accent-blue transition-colors" title="Edit card">
            <Pencil size={16} />
          </Link>
          <button onClick={() => setResetOpen(true)} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-warning transition-colors" title="Reset progress">
            <RotateCcw size={16} />
          </button>
          <button onClick={() => setDeleteOpen(true)} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-danger transition-colors" title="Delete card">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Card content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Front</h2>
          <CardHtmlRender html={card.frontHtml} interactive />
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Back</h2>
          <CardHtmlRender html={card.backHtml} interactive />
        </div>
      </div>

      {/* Concept */}
      <div className="bg-bg-secondary rounded-xl border border-border p-5">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Concept</h2>
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
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Bloom State</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Current Level</span>
                <span style={{ color: BLOOM_COLORS[bloom.currentLevel]?.text }}>{BLOOM_COLORS[bloom.currentLevel]?.label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Highest Reached</span>
                <span style={{ color: BLOOM_COLORS[bloom.highestReached]?.text }}>{BLOOM_COLORS[bloom.highestReached]?.label}</span>
              </div>
            </div>
          </div>
        )}
        {fsrs && (
          <div className="bg-bg-secondary rounded-xl border border-border p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">FSRS State</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">State</span><span>{FSRS_STATE_LABELS[fsrs.state as number] ?? 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Due</span><span>{new Date(fsrs.due).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Stability</span><span>{fsrs.stability.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Difficulty</span><span>{fsrs.difficulty.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Reviews</span><span>{fsrs.reps}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Lapses</span><span>{fsrs.lapses}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Review history */}
      {card.reviews && card.reviews.length > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Review History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-left py-2 pr-4">Bloom Level</th>
                  <th className="text-left py-2 pr-4">Rating</th>
                  <th className="text-left py-2 pr-4">Question</th>
                  <th className="text-left py-2">Answer</th>
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
                          {['', 'Again', 'Hard', 'Good', 'Easy'][review.rating]}
                        </span>
                      </td>
                      <td className={`py-2 pr-4 text-text-muted ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate max-w-[200px]'}`}>
                        {review.questionText}
                      </td>
                      <td className={`py-2 text-text-muted ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate max-w-[200px]'}`}>
                        {review.userAnswer ?? '—'}
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
        title="Reset Progress"
        message="This will reset the Bloom and FSRS state to their initial values and delete all review history for this card."
        confirmLabel="Reset"
        danger
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        title="Delete Card"
        message="This will permanently delete this card and all its review history."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
