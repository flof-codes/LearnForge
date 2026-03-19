import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, Trash2, Plus, FolderTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopic, useDeleteTopic } from '../../hooks/useTopics';
import { contextService } from '../../api/context';
import { useQuery } from '@tanstack/react-query';
import EditTopicModal from './EditTopicModal';
import ConfirmModal from '../../components/ConfirmModal';
import TopicBreadcrumb from '../../components/TopicBreadcrumb';
import BloomBadge from '../../components/BloomBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import DueForecastChart from '../../components/DueForecastChart';
import SubscriptionBanner from '../../components/SubscriptionBanner';

type CardFilter = 'all' | 'new' | 'learning' | 'due';
type CardSort = 'newest' | 'oldest' | 'updated' | 'studied';

interface ContextCard {
  id: string;
  concept: string;
  tags: string[];
  topicId: string;
  frontHtml: string;
  createdAt: string;
  updatedAt: string;
  bloomState: { currentLevel: number | null; highestReached: number | null };
  fsrsState: { due: string; state: number; lastReview: string | null } | null;
  reviews: { bloomLevel: number; rating: number; questionText: string; reviewedAt: string }[];
}

export default function TopicDetailPage() {
  const { t } = useTranslation('app');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: topic, isLoading } = useTopic(id!);
  const deleteTopic = useDeleteTopic();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filter, setFilter] = useState<CardFilter>('all');
  const [sort, setSort] = useState<CardSort>('newest');

  const { data: contextData } = useQuery({
    queryKey: ['context', 'topic', id],
    queryFn: () => contextService.topicCards(id!, 1).then(r => r.data),
    enabled: !!id,
  });

  const allCards: ContextCard[] = useMemo(() => (contextData as ContextCard[]) ?? [], [contextData]);

  const filteredCards = useMemo(() => {
    const now = new Date();
    let result = allCards;

    if (filter === 'new') {
      result = result.filter(c => !c.fsrsState || c.fsrsState.state === 0);
    } else if (filter === 'learning') {
      result = result.filter(c => c.fsrsState?.state === 1 || c.fsrsState?.state === 3);
    } else if (filter === 'due') {
      result = result.filter(c => c.fsrsState && new Date(c.fsrsState.due) <= now && c.fsrsState.state !== 0);
    }

    const sorted = [...result];
    if (sort === 'newest') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sort === 'updated') {
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sort === 'studied') {
      sorted.sort((a, b) => {
        const aTime = a.fsrsState?.lastReview ? new Date(a.fsrsState.lastReview).getTime() : 0;
        const bTime = b.fsrsState?.lastReview ? new Date(b.fsrsState.lastReview).getTime() : 0;
        return bTime - aTime;
      });
    }

    return sorted;
  }, [allCards, filter, sort]);

  if (isLoading) return <LoadingSpinner />;
  if (!topic) return <p className="text-text-muted">{t('topics.notFound')}</p>;

  const handleDelete = () => {
    deleteTopic.mutate(id!, { onSuccess: () => navigate('/dashboard/topics') });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newCount = (topic as any).newCount ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueCount = (topic as any).dueCount ?? 0;

  return (
    <div className="space-y-6">
      <SubscriptionBanner />
      <TopicBreadcrumb topicId={id} />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium">{topic.name}</h1>
          {topic.description && <p className="text-text-muted mt-1">{topic.description}</p>}
          <div className="flex items-center gap-3 mt-2">
            {newCount > 0 && (
              <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-accent-blue/15 text-accent-blue">
                {t('topics.newBadge', { count: newCount })}
              </span>
            )}
            {dueCount > 0 && (
              <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-accent-green/15 text-accent-green">
                {t('topics.dueBadge', { count: dueCount })}
              </span>
            )}
            {newCount === 0 && dueCount === 0 && topic.cardCount > 0 && (
              <span className="text-xs text-text-muted">{t('topics.allUpToDate', { count: topic.cardCount })}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)} className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-accent-blue transition-colors">
            <Pencil size={16} />
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            disabled={topic.cardCount > 0}
            className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-muted"
            title={topic.cardCount > 0 ? t('topics.deleteCardFirst', { count: topic.cardCount }) : t('topics.delete')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Subtopics */}
      {topic.children && topic.children.length > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">{t('topics.subtopics')}</h2>
          <div className="space-y-1">
            {topic.children.map(child => (
              <Link
                key={child.id}
                to={`/dashboard/topics/${child.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-surface transition-colors"
              >
                <FolderTree size={14} className="text-text-muted" />
                <span className="text-sm">{child.name}</span>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(child as any).cardCount > 0 && (
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                  <span className="text-xs text-text-muted bg-bg-surface px-1.5 py-0.5 rounded">{(child as any).cardCount}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Due Forecast */}
      <DueForecastChart topicId={id} />

      {/* Cards in this topic */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {filter !== 'all' ? t('topics.cardsFiltered', { filtered: filteredCards.length, total: allCards.length }) : t('topics.cardsCount', { count: allCards.length })}
          </h2>
          <Link
            to={`/dashboard/cards/new?topicId=${id}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-accent-blue text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> {t('topics.addCard')}
          </Link>
        </div>

        {allCards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([
              { key: 'all' as CardFilter, label: t('cards.filterAll') },
              { key: 'new' as CardFilter, label: t('cards.filterNew') },
              { key: 'learning' as CardFilter, label: t('cards.filterLearning') },
              { key: 'due' as CardFilter, label: t('cards.filterDue') },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                  filter === f.key
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'bg-bg-surface text-text-muted hover:text-text'
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-border">|</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as CardSort)}
              className="text-xs bg-bg-surface text-text-muted rounded-lg px-2 py-1 border-none outline-none cursor-pointer hover:text-text transition-colors"
            >
              <option value="newest">{t('cards.sortNewest')}</option>
              <option value="oldest">{t('cards.sortOldest')}</option>
              <option value="updated">{t('cards.sortUpdated')}</option>
              <option value="studied">{t('cards.sortStudied')}</option>
            </select>
          </div>
        )}

        {filteredCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCards.map(card => (
              <Link
                key={card.id}
                to={`/dashboard/cards/${card.id}`}
                className="bg-bg-secondary rounded-xl border border-border p-4 hover:bg-bg-surface transition-colors"
              >
                <p className="text-sm line-clamp-2 mb-2">{card.concept}</p>
                <div className="flex items-center gap-2">
                  <BloomBadge level={card.bloomState?.currentLevel ?? 0} />
                  {card.tags?.length > 0 && (
                    <span className="text-xs text-text-muted">{card.tags.slice(0, 2).join(', ')}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : allCards.length > 0 ? (
          <div className="text-center py-8 text-text-muted bg-bg-secondary rounded-xl border border-border">
            <p className="text-sm">{t('topics.noCardsFilter')}</p>
          </div>
        ) : (
          <div className="text-center py-8 text-text-muted bg-bg-secondary rounded-xl border border-border">
            <p className="text-sm">{t('topics.noCardsInTopic')}</p>
          </div>
        )}
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <EditTopicModal open={editOpen} topic={topic as any} onClose={() => setEditOpen(false)} />
      <ConfirmModal
        open={deleteOpen}
        title={t('topics.deleteTitle')}
        message={t('topics.deleteMessage', { name: topic.name })}
        confirmLabel={t('topics.deleteConfirm')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
