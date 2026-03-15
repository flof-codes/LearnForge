import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Layers, Flame, Sparkles } from 'lucide-react';
import { useStudySummary, useStudyStats } from '../hooks/useStudy';
import { BLOOM_COLORS } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import DueForecastChart from '../components/DueForecastChart';

const STATE_COLORS: Record<string, { bg: string; label: string }> = {
  new:         { bg: '#58a6ff', label: 'New' },
  learning:    { bg: '#d29922', label: 'Learning' },
  relearning:  { bg: '#f85149', label: 'Relearning' },
  young:       { bg: '#56d364', label: 'Young' },
  mature:      { bg: '#bc8cff', label: 'Mature' },
};

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useStudySummary();
  const { data: stats, isLoading: statsLoading } = useStudyStats();

  if (summaryLoading || statsLoading) return <LoadingSpinner />;

  const totalBloom = summary ? Object.values(summary.bloomLevels).reduce((a, b) => a + b, 0) : 0;
  const totalStateCards = stats ? Object.values(stats.cardStates).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium">Dashboard</h1>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">Total Cards</p>
          <p className="text-3xl font-light tabular-nums mt-1">{summary?.totalCards ?? 0}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">Due Now</p>
          <p className="text-3xl font-light tabular-nums mt-1 text-warning">{summary?.dueCount ?? 0}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <p className="text-text-muted text-sm">7-Day Accuracy</p>
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
              <span>Review Streak</span>
            </div>
            <p className="text-3xl font-light tabular-nums mt-1">
              {stats.streak}<span className="text-sm text-text-muted ml-1">days</span>
            </p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Sparkles size={14} />
              <span>Creation Streak</span>
            </div>
            <p className="text-3xl font-light tabular-nums mt-1">
              {stats.creationStreak}<span className="text-sm text-text-muted ml-1">days</span>
            </p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">Reviews Today</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.reviewsToday}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">Created Today</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.cardsCreatedToday}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">Avg / Day</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.averagePerDay}</p>
          </div>
          <div className="bg-bg-secondary rounded-xl border border-border p-6">
            <p className="text-text-muted text-sm">Avg / Month</p>
            <p className="text-3xl font-light tabular-nums mt-1">{stats.averagePerMonth}</p>
          </div>
        </div>
      )}

      {/* Card States */}
      {stats && totalStateCards > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">Card States</h2>
          <div className="h-6 flex rounded-full overflow-hidden bg-bg-surface">
            {Object.entries(stats.cardStates).map(([key, count]) => {
              const pct = totalStateCards > 0 ? (count / totalStateCards) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={key}
                  className="h-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: STATE_COLORS[key].bg }}
                  title={`${STATE_COLORS[key].label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {Object.entries(stats.cardStates).map(([key, count]) => (
              <div key={key} className="flex items-center gap-2 text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATE_COLORS[key].bg }} />
                <span>{STATE_COLORS[key].label}</span>
                <span className="tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Due Forecast */}
      <DueForecastChart />

      {/* Bloom distribution */}
      {summary && totalBloom > 0 && (
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">Bloom Level Distribution</h2>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map(level => {
              const count = summary.bloomLevels[String(level)] ?? 0;
              const pct = totalBloom > 0 ? (count / totalBloom) * 100 : 0;
              const color = BLOOM_COLORS[level];
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="text-xs w-20 text-right" style={{ color: color.text }}>{color.label}</span>
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
          to="/study"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <GraduationCap size={22} className="text-accent-green" />
          <span className="font-medium">Start Study</span>
        </Link>
        <Link
          to="/cards/new"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <Plus size={22} className="text-accent-blue" />
          <span className="font-medium">Create Card</span>
        </Link>
        <Link
          to="/topics"
          className="flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <Layers size={22} className="text-accent-purple" />
          <span className="font-medium">Browse Topics</span>
        </Link>
      </div>

      {/* Empty state */}
      {summary?.totalCards === 0 && (
        <div className="text-center py-12 text-text-muted">
          <p className="text-lg mb-2">No cards yet</p>
          <p className="text-sm">Create a topic and add some cards to get started.</p>
        </div>
      )}
    </div>
  );
}
