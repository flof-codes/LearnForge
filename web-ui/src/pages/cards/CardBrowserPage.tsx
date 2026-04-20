import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopics } from '../../hooks/useTopics';
import { useStudySummary } from '../../hooks/useStudy';
import { cardService, type CardListSort, type CardListStatus } from '../../api/cards';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import CardGrid from './CardGrid';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorFallback from '../../components/ErrorFallback';
import Pagination from '../../components/Pagination';
import { BLOOM_COLORS } from '../../types';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

interface BrowseCard {
  id: string;
  concept: string;
  frontHtml?: string;
  topicId?: string;
  tags: string[];
  bloomState?: { currentLevel: number };
  fsrsState?: { due: string };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function CardBrowserPage() {
  const { t } = useTranslation('app');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [topicFilter, setTopicFilter] = useState('');
  const [bloomFilter, setBloomFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<CardListStatus>('all');
  const [sort, setSort] = useState<CardListSort>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: topics, isError: topicsError, error: topicsErr, refetch: refetchTopics } = useTopics();
  const { data: summary } = useStudySummary();

  // Reset to first page when any filter changes — done during render
  // (React's recommended pattern for resetting derived state without useEffect).
  const filterKey = `${debouncedSearch}|${topicFilter}|${bloomFilter}|${statusFilter}|${sort}|${pageSize}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const offset = (page - 1) * pageSize;

  const listQuery = useQuery({
    queryKey: ['cards', 'browse', {
      topic: topicFilter, search: debouncedSearch, bloom: bloomFilter, status: statusFilter,
      sort, offset, limit: pageSize,
    }],
    queryFn: async () => {
      const res = await cardService.list({
        topicId: topicFilter || undefined,
        search: debouncedSearch || undefined,
        bloomLevel: bloomFilter === '' ? undefined : bloomFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sort,
        offset,
        limit: pageSize,
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  if (topicsError || listQuery.isError) {
    const err = topicsErr || listQuery.error;
    return (
      <ErrorFallback
        message={(err as Error)?.message}
        onReset={() => { refetchTopics(); listQuery.refetch(); }}
      />
    );
  }

  const cards = (listQuery.data?.cards ?? []) as BrowseCard[];
  const total = listQuery.data?.total ?? 0;

  const hasFilters =
    search.trim() !== '' ||
    topicFilter !== '' ||
    bloomFilter !== '' ||
    statusFilter !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">{t('cards.title')}</h1>
        <Link
          to="/dashboard/cards/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> {t('cards.newCard')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder={t('cards.searchPlaceholder')}
          />
        </div>
        <select
          value={topicFilter}
          onChange={e => setTopicFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
        >
          <option value="">{t('cards.allTopics')}</option>
          {(topics ?? []).map(tp => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
        <select
          value={bloomFilter}
          onChange={e => setBloomFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
        >
          <option value="">{t('cards.allBloomLevels')}</option>
          {[0, 1, 2, 3, 4, 5].map(l => (
            <option key={l} value={l}>{t(BLOOM_COLORS[l].labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Status filter + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all', labelKey: 'cards.filterAll' },
          { key: 'new', labelKey: 'cards.filterNew' },
          { key: 'learning', labelKey: 'cards.filterLearning' },
          { key: 'due', labelKey: 'cards.filterDue' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              statusFilter === f.key
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'bg-bg-surface text-text-muted hover:text-text'
            }`}
          >
            {t(f.labelKey)}
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

      {/* Results */}
      {listQuery.isLoading ? (
        <LoadingSpinner />
      ) : cards.length > 0 ? (
        <>
          <CardGrid cards={cards} topics={topics} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </>
      ) : (
        <div className="text-center py-12 text-text-muted">
          <Layers size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">
            {hasFilters ? t('cards.noMatchFilters') : t('cards.noCardsYet')}
          </p>
        </div>
      )}

      {/* Summary stats */}
      {summary && (
        <div className="text-xs text-text-muted text-right">
          {t('cards.totalAndDue', { total: summary.totalCards, due: summary.dueCount })}
        </div>
      )}
    </div>
  );
}
