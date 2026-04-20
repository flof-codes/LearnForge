import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, Trash2, Plus, FolderTree, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopic, useDeleteTopic } from '../../hooks/useTopics';
import { useStudySummary } from '../../hooks/useStudy';
import { cardService, type CardListSort, type CardListStatus } from '../../api/cards';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import EditTopicModal from './EditTopicModal';
import ShareTopicModal from './ShareTopicModal';
import ConfirmModal from '../../components/ConfirmModal';
import TopicBreadcrumb from '../../components/TopicBreadcrumb';
import BloomBadge from '../../components/BloomBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import DueForecastChart from '../../components/DueForecastChart';
import BloomStateChart from '../../components/BloomStateChart';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import Pagination from '../../components/Pagination';
import { extractErrorMessage } from '../../utils/extractErrorMessage';

interface ListCard {
  id: string;
  concept: string;
  tags: string[];
  topicId: string;
  frontHtml: string;
  createdAt: string;
  updatedAt: string;
  bloomState: { currentLevel: number | null; highestReached: number | null };
  fsrsState: { due: string; state: number; lastReview: string | null } | null;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export default function TopicDetailPage() {
  const { t } = useTranslation('app');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: topic, isLoading, isError, error, refetch } = useTopic(id!);
  const deleteTopic = useDeleteTopic();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardListStatus>('all');
  const [sort, setSort] = useState<CardListSort>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: studySummary } = useStudySummary(id);

  // Reset to first page when filters or topic change — done during render
  // (React's recommended pattern for resetting derived state without useEffect).
  const filterKey = `${id ?? ''}|${filter}|${sort}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const offset = (page - 1) * pageSize;

  const listQuery = useQuery({
    queryKey: ['cards', 'topic', id, { filter, sort, offset, pageSize }],
    queryFn: async () => {
      const res = await cardService.list({
        topicId: id,
        includeDescendants: false,
        status: filter === 'all' ? undefined : filter,
        sort,
        offset,
        limit: pageSize,
      });
      return res.data;
    },
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

  const pageCards = (listQuery.data?.cards ?? []) as ListCard[];
  const total = listQuery.data?.total ?? 0;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorFallback message={(error as Error).message} onReset={() => refetch()} />;
  if (!topic) return <p className="text-text-muted">{t('topics.notFound')}</p>;

  const handleDelete = () => {
    setDeleteError(null);
    deleteTopic.mutate(id!, {
      onSuccess: () => navigate('/dashboard/topics'),
      onError: (err) => { setDeleteOpen(false); setDeleteError(extractErrorMessage(err) || t('errors.deleteTopicFailed')); },
    });
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
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-lg bg-bg-surface text-text-muted hover:text-accent-blue transition-colors"
            title={t('shares.buttonTitle')}
          >
            <Share2 size={16} />
          </button>
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

      {deleteError && (
        <div className="rounded-lg px-3 py-2 text-sm bg-danger/15 text-danger">
          {deleteError}
        </div>
      )}

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

      {/* Bloom × Card State */}
      {studySummary?.bloomStateMatrix && <BloomStateChart matrix={studySummary.bloomStateMatrix} />}

      {/* Due Forecast */}
      <DueForecastChart topicId={id} />

      {/* Cards in this topic */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('topics.cardsCount', { count: total })}
          </h2>
          <Link
            to={`/dashboard/cards/new?topicId=${id}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-accent-blue text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> {t('topics.addCard')}
          </Link>
        </div>

        {(total > 0 || filter !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([
              { key: 'all' as CardListStatus, label: t('cards.filterAll') },
              { key: 'new' as CardListStatus, label: t('cards.filterNew') },
              { key: 'learning' as CardListStatus, label: t('cards.filterLearning') },
              { key: 'due' as CardListStatus, label: t('cards.filterDue') },
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
              onChange={e => setSort(e.target.value as CardListSort)}
              className="text-xs bg-bg-surface text-text-muted rounded-lg px-2 py-1 border-none outline-none cursor-pointer hover:text-text transition-colors"
            >
              <option value="newest">{t('cards.sortNewest')}</option>
              <option value="oldest">{t('cards.sortOldest')}</option>
              <option value="updated">{t('cards.sortUpdated')}</option>
              <option value="studied">{t('cards.sortStudied')}</option>
              <option value="concept">{t('cards.sortConcept')}</option>
            </select>
          </div>
        )}

        {pageCards.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pageCards.map(card => (
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
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </div>
          </>
        ) : total === 0 && filter !== 'all' ? (
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
      <ShareTopicModal open={shareOpen} topicId={id!} topicName={topic.name} onClose={() => setShareOpen(false)} />
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
