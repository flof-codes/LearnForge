import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Plus, Layers, Flame, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudySummary, useStudyStats } from '../hooks/useStudy';
import { useTopics } from '../hooks/useTopics';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorFallback from '../components/ErrorFallback';
import DueForecastChart from '../components/DueForecastChart';
import TopicPieChart from '../components/TopicPieChart';
import BloomStateChart from '../components/BloomStateChart';
import SubscriptionBanner from '../components/SubscriptionBanner';
import OnboardingWizard from '../components/OnboardingWizard';
import { formatPercent } from '../utils/format';

export default function Dashboard() {
  const { t, i18n } = useTranslation('app');
  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErr, refetch: refetchSummary } = useStudySummary();
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErr, refetch: refetchStats } = useStudyStats();
  const { data: topics, isLoading: topicsLoading, isError: topicsError, error: topicsErr, refetch: refetchTopics } = useTopics();
  const [wizardDismissed, setWizardDismissed] = useState(() => localStorage.getItem('learnforge-wizard-dismissed') === '1');

  if (summaryLoading || statsLoading || topicsLoading) return <LoadingSpinner />;

  if (summaryError || statsError || topicsError) {
    const err = summaryErr || statsErr || topicsErr;
    return <ErrorFallback message={(err as Error).message} onReset={() => { refetchSummary(); refetchStats(); refetchTopics(); }} />;
  }

  const isEmpty = summary?.totalCards === 0 && (!topics || topics.length === 0);
  if (isEmpty && !wizardDismissed) {
    return <OnboardingWizard onSkip={() => { localStorage.setItem('learnforge-wizard-dismissed', '1'); setWizardDismissed(true); }} />;
  }


  const accuracy = summary?.accuracy7d != null ? formatPercent(summary.accuracy7d, i18n.language) : '--';
  const miniStats: { label: string; value: number; unit?: string }[] = stats ? [
    { label: t('dashboard.reviewStreak'), value: stats.streak, unit: t('dashboard.days') },
    { label: t('dashboard.creationStreak'), value: stats.creationStreak, unit: t('dashboard.days') },
    { label: t('dashboard.reviewsToday'), value: stats.reviewsToday },
    { label: t('dashboard.createdToday'), value: stats.cardsCreatedToday },
    { label: t('dashboard.avgPerDay'), value: stats.averagePerDay },
    { label: t('dashboard.avgPerMonth'), value: stats.averagePerMonth },
  ] : [];

  return (
    <div className="space-y-6 md:space-y-8">
      <SubscriptionBanner />
      <h1 className="text-2xl font-medium">{t('dashboard.title')}</h1>

      {/* Phone: all numbers in one edge-to-edge block, then the way into a session */}
      <div className="md:hidden lf-bleed bg-bg-secondary border-y border-border">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="px-4 py-3 min-w-0">
            <p className="text-text-muted text-xs leading-tight">{t('dashboard.totalCards')}</p>
            <p className="text-2xl font-light tabular-nums mt-1">{summary?.totalCards ?? 0}</p>
          </div>
          <div className="px-4 py-3 min-w-0">
            <p className="text-text-muted text-xs leading-tight">{t('dashboard.dueNow')}</p>
            <p className="text-2xl font-light tabular-nums mt-1 text-warning">{summary?.dueCount ?? 0}</p>
          </div>
          <div className="px-4 py-3 min-w-0">
            <p className="text-text-muted text-xs leading-tight">{t('dashboard.accuracy7d')}</p>
            <p className="text-2xl font-light tabular-nums mt-1">{accuracy}</p>
          </div>
        </div>
        {[0, 3].map(start => miniStats.length > 0 && (
          <div key={start} className="grid grid-cols-3 divide-x divide-border border-t border-border">
            {miniStats.slice(start, start + 3).map(({ label, value, unit }) => (
              <div key={label} className="px-4 py-2.5 min-w-0">
                <p className="text-text-muted text-xs leading-tight">{label}</p>
                <p className="text-lg tabular-nums mt-0.5">
                  {value}{unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
                </p>
              </div>
            ))}
          </div>
        ))}
        {(summary?.totalCards ?? 0) > 0 && (
          <div className="p-4 border-t border-border">
            <Link
              to="/dashboard/study"
              className="flex items-center justify-center gap-2 py-3 rounded-lg bg-accent-blue text-white font-medium"
            >
              <GraduationCap size={20} />
              {t('dashboard.startStudy')}
            </Link>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="hidden md:grid md:grid-cols-3 gap-5">
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
            {accuracy}
          </p>
        </div>
      </div>

      {/* Streak & Activity */}
      {stats && (
        <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-6 gap-5">
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

      {/* Due Forecast */}
      <DueForecastChart />

      {/* Bloom × Card State */}
      {summary?.bloomStateMatrix && <BloomStateChart matrix={summary.bloomStateMatrix} />}

      {/* Topic Distribution */}
      {topics && topics.length > 0 && <TopicPieChart topics={topics} />}


      {/* Quick actions — rows on a phone, cards from md up */}
      <div className="lf-bleed bg-bg-secondary border-y border-border divide-y divide-border md:bg-transparent md:border-y-0 md:divide-y-0 md:grid md:grid-cols-3 md:gap-5">
        <Link
          to="/dashboard/study"
          className="hidden md:flex items-center gap-3 bg-bg-secondary rounded-xl border border-border p-6 hover:bg-bg-surface transition-colors"
        >
          <GraduationCap size={22} className="text-accent-green" />
          <span className="font-medium">{t('dashboard.startStudy')}</span>
        </Link>
        <Link
          to="/dashboard/cards/new"
          className="flex items-center gap-3 px-4 py-3.5 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6 hover:bg-bg-surface transition-colors"
        >
          <Plus size={22} className="text-accent-blue" />
          <span className="font-medium">{t('dashboard.createCard')}</span>
        </Link>
        <Link
          to="/dashboard/topics"
          className="flex items-center gap-3 px-4 py-3.5 md:bg-bg-secondary md:rounded-xl md:border md:border-border md:p-6 hover:bg-bg-surface transition-colors"
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
