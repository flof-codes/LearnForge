import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTopics } from '../../hooks/useTopics';
import { useStudySummary } from '../../hooks/useStudy';
import { BLOOM_COLORS } from '../../types';
import LoadingSpinner from '../../components/LoadingSpinner';
import SubscriptionBanner from '../../components/SubscriptionBanner';

export default function StudyStartPage() {
  const { t } = useTranslation('app');
  const [topicId, setTopicId] = useState('');
  const { data: topics } = useTopics();
  const { data: summary, isLoading } = useStudySummary(topicId || undefined);
  const navigate = useNavigate();

  const handleStart = () => {
    const params = new URLSearchParams();
    if (topicId) params.set('topicId', topicId);
    navigate(`/dashboard/study/session?${params.toString()}`);
  };

  if (isLoading) return <LoadingSpinner />;

  const totalBloom = summary ? Object.values(summary.bloomLevels).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <SubscriptionBanner />
      <h1 className="text-2xl font-medium">{t('study.title')}</h1>

      {/* Topic selector */}
      <div className="bg-bg-secondary rounded-xl border border-border p-6 space-y-4">
        <div>
          <label className="block text-sm text-text-muted mb-1">{t('study.topic')}</label>
          <select
            value={topicId}
            onChange={e => setTopicId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="">{t('study.allTopics')}</option>
            {(topics ?? []).map(tp => (
              <option key={tp.id} value={tp.id}>{tp.name}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Stats */}
      {summary && (
        <div className="bg-bg-secondary rounded-xl border border-border p-6">
          <div className="grid grid-cols-4 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-light tabular-nums">{summary.totalCards}</p>
              <p className="text-xs text-text-muted">{t('study.total')}</p>
            </div>
            <div>
              <p className="text-2xl font-light tabular-nums text-accent-blue">{summary.newCount}</p>
              <p className="text-xs text-text-muted">{t('study.new')}</p>
            </div>
            <div>
              <p className="text-2xl font-light tabular-nums text-warning">{summary.dueCount}</p>
              <p className="text-xs text-text-muted">{t('study.due')}</p>
            </div>
            <div>
              <p className="text-2xl font-light tabular-nums">{summary.accuracy7d != null ? `${summary.accuracy7d}%` : '--'}</p>
              <p className="text-xs text-text-muted">{t('study.accuracy7d')}</p>
            </div>
          </div>
          {totalBloom > 0 && (
            <div className="flex h-3 rounded-full overflow-hidden">
              {[0, 1, 2, 3, 4, 5].map(level => {
                const count = summary.bloomLevels[String(level)] ?? 0;
                const pct = (count / totalBloom) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={level}
                    className="h-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: BLOOM_COLORS[level].text }}
                    title={`${t(BLOOM_COLORS[level].labelKey)}: ${count}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!summary || (summary.dueCount + summary.newCount) === 0}
        className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-lg font-semibold bg-accent-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        <GraduationCap size={24} />
        {summary && (summary.dueCount + summary.newCount) === 0
          ? t('study.noCardsDue')
          : t('study.startSession', { count: (summary?.dueCount ?? 0) + (summary?.newCount ?? 0) })}
      </button>
    </div>
  );
}
