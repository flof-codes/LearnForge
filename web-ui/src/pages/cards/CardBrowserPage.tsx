import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Layers } from 'lucide-react';
import { useTopics } from '../../hooks/useTopics';
import { useStudySummary } from '../../hooks/useStudy';
import { contextService } from '../../api/context';
import { useQuery } from '@tanstack/react-query';
import CardGrid from './CardGrid';
import LoadingSpinner from '../../components/LoadingSpinner';
import { BLOOM_COLORS } from '../../types';

type StatusFilter = 'all' | 'new' | 'learning' | 'due';
type CardSort = 'newest' | 'oldest' | 'updated' | 'studied';

export default function CardBrowserPage() {
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [bloomFilter, setBloomFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<CardSort>('newest');
  const { data: topics } = useTopics();
  const { data: summary } = useStudySummary();

  // Fetch all cards via context endpoint for the selected topic, or use a broad fetch
  const { data: allCards, isLoading } = useQuery({
    queryKey: ['cards', 'browse', topicFilter],
    queryFn: async () => {
      if (topicFilter) {
        const res = await contextService.topicCards(topicFilter, 100);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return res.data as any[];
      }
      // Without topic filter, fetch from each root topic
      if (!topics?.length) return [];
      const results = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topics.map(t => contextService.topicCards(t.id, 100).then(r => r.data as any[]))
      );
      return results.flat();
    },
    enabled: topicFilter ? true : !!topics,
  });

  const cards = useMemo(() => {
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
    let result = (allCards ?? []).filter((card: any) => {
      if (search && !card.concept.toLowerCase().includes(search.toLowerCase())) return false;
      if (bloomFilter !== '' && (card.bloomState?.currentLevel ?? 0) !== bloomFilter) return false;
      if (statusFilter === 'new' && card.fsrsState && card.fsrsState.state !== 0) return false;
      if (statusFilter === 'learning' && (!card.fsrsState || (card.fsrsState.state !== 1 && card.fsrsState.state !== 3))) return false;
      if (statusFilter === 'due' && (!card.fsrsState || new Date(card.fsrsState.due) > now || card.fsrsState.state === 0)) return false;
      return true;
    });

    if (sort === 'newest') {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      result.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'oldest') {
      result.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sort === 'updated') {
      result.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sort === 'studied') {
      result.sort((a: any, b: any) => {
        const aTime = a.fsrsState?.lastReview ? new Date(a.fsrsState.lastReview).getTime() : 0;
        const bTime = b.fsrsState?.lastReview ? new Date(b.fsrsState.lastReview).getTime() : 0;
        return bTime - aTime;
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }

    return result;
  }, [allCards, search, bloomFilter, statusFilter, sort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Cards</h1>
        <Link
          to="/cards/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> New Card
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
            placeholder="Search concepts..."
          />
        </div>
        <select
          value={topicFilter}
          onChange={e => setTopicFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
        >
          <option value="">All Topics</option>
          {(topics ?? []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={bloomFilter}
          onChange={e => setBloomFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
        >
          <option value="">All Bloom Levels</option>
          {[0, 1, 2, 3, 4, 5].map(l => (
            <option key={l} value={l}>{BLOOM_COLORS[l].label}</option>
          ))}
        </select>
      </div>

      {/* Status filter + Sort */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: 'all', label: 'All' },
          { key: 'new', label: 'New' },
          { key: 'learning', label: 'Learning' },
          { key: 'due', label: 'Due' },
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
            {f.label}
          </button>
        ))}
        <span className="text-border">|</span>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as CardSort)}
          className="text-xs bg-bg-surface text-text-muted rounded-lg px-2 py-1 border-none outline-none cursor-pointer hover:text-text transition-colors"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="updated">Recently updated</option>
          <option value="studied">Recently studied</option>
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner />
      ) : cards.length > 0 ? (
        <>
          <p className="text-sm text-text-muted">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
          <CardGrid cards={cards} topics={topics} />
        </>
      ) : (
        <div className="text-center py-12 text-text-muted">
          <Layers size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">
            {search || topicFilter || bloomFilter !== '' || statusFilter !== 'all'
              ? 'No cards match your filters.'
              : 'No cards yet. Create a card to get started.'}
          </p>
        </div>
      )}

      {/* Summary stats */}
      {summary && (
        <div className="text-xs text-text-muted text-right">
          {summary.totalCards} total cards | {summary.dueCount} due
        </div>
      )}
    </div>
  );
}
