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

export default function Dashboard() {
  const { t } = useTranslation('app');
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

      {/* Due Forecast */}
      <DueForecastChart />

      {/* Bloom × Card State */}
      {summary?.bloomStateMatrix && <BloomStateChart matrix={summary.bloomStateMatrix} />}

      {/* Topic Distribution */}
      {topics && topics.length > 0 && <TopicPieChart topics={topics} />}


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
