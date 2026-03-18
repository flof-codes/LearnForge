import { Link } from 'react-router-dom';
import { Trophy, ArrowLeft, RotateCcw } from 'lucide-react';

interface Props {
  cardsReviewed: number;
  ratings: number[];
  bloomChanges: { from: number; to: number }[];
}

export default function SessionSummary({ cardsReviewed, ratings, bloomChanges }: Props) {
  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '--';
  const bloomUps = bloomChanges.filter(c => c.to > c.from).length;
  const bloomDowns = bloomChanges.filter(c => c.to < c.from).length;

  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <Trophy size={48} className="mx-auto text-accent-green" />
      <h2 className="text-2xl font-medium">Session Complete</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <p className="text-2xl font-light tabular-nums">{cardsReviewed}</p>
          <p className="text-xs text-text-muted">Reviewed</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <p className="text-2xl font-light tabular-nums">{avgRating}</p>
          <p className="text-xs text-text-muted">Avg Rating</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border p-5">
          <p className="text-2xl font-light tabular-nums text-accent-green">+{bloomUps}</p>
          <p className="text-xs text-text-muted">Bloom Ups</p>
          {bloomDowns > 0 && <p className="text-xs text-danger">-{bloomDowns}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/dashboard"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-bg-surface border border-border text-sm hover:bg-bg-hover transition-colors"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <Link
          to="/dashboard/study"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-blue text-white text-sm hover:opacity-90 transition-opacity"
        >
          <RotateCcw size={16} /> Study More
        </Link>
      </div>
    </div>
  );
}
