import { Link } from 'react-router-dom';
import { Trophy, ArrowLeft, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  cardsReviewed: number;
  ratings: number[];
}

export default function SessionSummary({ cardsReviewed, ratings }: Props) {
  const { t } = useTranslation('app');
  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '--';

  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <Trophy size={48} className="mx-auto text-accent-green" />
      <h2 className="text-2xl font-medium">{t('sessionSummary.title')}</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <p className="text-2xl font-light tabular-nums">{cardsReviewed}</p>
          <p className="text-xs text-text-muted">{t('sessionSummary.reviewed')}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <p className="text-2xl font-light tabular-nums">{avgRating}</p>
          <p className="text-xs text-text-muted">{t('sessionSummary.avgRating')}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/dashboard"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-bg-surface border border-border text-sm hover:bg-bg-hover transition-colors"
        >
          <ArrowLeft size={16} /> {t('sessionSummary.dashboard')}
        </Link>
        <Link
          to="/dashboard/study"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-blue text-white text-sm hover:opacity-90 transition-opacity"
        >
          <RotateCcw size={16} /> {t('sessionSummary.studyMore')}
        </Link>
      </div>
    </div>
  );
}
