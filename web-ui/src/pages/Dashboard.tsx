import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Layers, Flame, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudySummary, useStudyStats } from '../hooks/useStudy';
import { useTopics } from '../hooks/useTopics';
import { BLOOM_COLORS } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import DueForecastChart from '../components/DueForecastChart';
import TopicPieChart from '../components/TopicPieChart';
import SubscriptionBanner from '../components/SubscriptionBanner';

const STATE_COLOR_MAP: Record<string, string> = {
  new:         '#58a6ff',
  learning:    '#d29922',
  relearning:  '#f85149',
  young:       '#56d364',
  mature:      '#bc8cff',
};

export default function Dashboard() {
  const { t } = useTranslation('app');
  const { data: summary, isLoading: summaryLoading } = useStudySummary();
  const { data: stats, isLoading: statsLoading } = useStudyStats();
  const { data: topics } = useTopics();

  if (summaryLoading || statsLoading) return <LoadingSpinner />;

  const totalBloom = summary ? Object.values(summary.bloomLevels).reduce((a, b) => a + b, 0) : 0;
  const totalStateCards = stats ? Object.values(stats.cardStates).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-8">
      <SubscriptionBanner />
      <h1 className="text-2xl font-medium">{t('dashboard.title')}</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">{t('dashboard.totalCards')}</p>
          <p className="text-3xl font-light tabular-nums mt-1">{summary?.totalCards ?? 0}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">{t('dashboard.dueNow')}</p>
          <p className="text-3xl font-light tabular-nums mt-1 text-warning">{summary?.dueCount ?? 0}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">{t('dashboard.accuracy7d')}</p>
          <p className="text-3xl font-light tabular-nums mt-1">
            {summary?.accuracy7d != null ? `${summary.accuracy7d}%` : '--'}
          </p>
        </div>
      </div>

      {/* Streak & Activity */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Flame size={14} />
              <span>{t('dashboard.reviewStreak')}</span>
            </div>
            <p className="text-3xl font-light tabular-nums mt-1">
              {stats.streak}<span className="text-sm text-text-muted ml-1">{t('dashboard.days')}</span>
            </p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Sparkles size={14} />
              <span>{t('dashboard.creationStreak')}</span>
            </div>
            <p className="text-3xl font-light tabular-nums mt-1">
              {stats.creationStreak}<span className="text-sm text-text-muted ml-1">{t('dashboard.days')}</span>
            </p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">{t('dashboard.reviewsToday')}</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.reviewsToday}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">{t('dashboard.createdToday')}</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.cardsCreatedToday}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">{t('dashboard.avgPerDay')}</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.averagePerDay}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">{t('dashboard.avgPerMonth')}</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.averagePerMonth}</p>
          </div>
        </div>
      )}

      {/* Card States */}
      {stats && totalStateCards > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">{t('dashboard.cardStates')}</h2>
          <div className="h-6 flex rounded-full overflow-hidden bg-bg-surface">
            {Object.entries(stats.cardStates).map(([key, count]) => {
              const pct = totalStateCards > 0 ? (count / totalStateCards) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={key}
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: STATE_COLOR_MAP[key] }}
                  title={`${t(`cardStates.${key}`)}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {Object.entries(stats.cardStates).map(([key, count]) => (
              <div key={key} className="flex items-center gap-2 text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATE_COLOR_MAP[key] }} />
                <span>{t(`cardStates.${key}`)}</span>
                <span className="tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topic Distribution */}
      {topics && topics.length > 0 && <TopicPieChart topics={topics} />}

      {/* Due Forecast */}
      <DueForecastChart />

      {/* Bloom distribution */}
      {summary && totalBloom > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">{t('dashboard.bloomDistribution')}</h2>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map(level => {
              const count = summary.bloomLevels[String(level)] ?? 0;
              const pct = totalBloom > 0 ? (count / totalBloom) * 100 : 0;
              const color = BLOOM_COLORS[level];
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-xs w-20 text-right" style={{ color: color.text }}>{t(color.labelKey)}</span>
                  <div className="flex-1 h-5 bg-bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color.text }}
                    />
                  </div>
                  <span className="text-xs text-text-muted w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Link
          to="/dashboard/study"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <GraduationCap size={22} className="text-accent-green" />
          <span className="font-medium">{t('dashboard.startStudy')}</span>
        </Link>
        <Link
          to="/dashboard/cards/new"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <Plus size={22} className="text-accent-blue" />
          <span className="font-medium">{t('dashboard.createCard')}</span>
        </Link>
        <Link
          to="/dashboard/topics"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <Layers size={22} className="text-accent-purple" />
          <span className="font-medium">{t('dashboard.browseTopics')}</span>
        </Link>
      </div>

      {/* Empty state */}
      {summary?.totalCards === 0 && (
        <div className="text-center py-12 text-text-muted">
          <p className="text-lg mb-2">{t('dashboard.noCardsYet')}</p>
          <p className="text-sm">{t('dashboard.noCardsHint')}</p>
        </div>
      )}
    </div>
  );
}
