import { useTranslation } from 'react-i18next';
import { BLOOM_COLORS } from '../types';

const STATE_KEYS = ['new', 'learning', 'relearning', 'recall', 'young', 'mature'] as const;

const STATE_COLORS: Record<string, string> = {
  new:         '#DBEAFE',
  learning:    '#60A5FA',
  relearning:  '#2563EB',
  recall:      '#1E3A8A',
  young:       '#6EE7B7',
  mature:      '#059669',
};

interface Props {
  matrix: Record<string, Record<string, number>>;
  title?: string;
}

export default function BloomStateChart({ matrix, title }: Props) {
  const { t } = useTranslation('app');

  const levels = [0, 1, 2, 3, 4, 5];
  const rowTotals = levels.map(l => {
    const row = matrix[String(l)] ?? {};
    return STATE_KEYS.reduce((sum, k) => sum + (row[k] ?? 0), 0);
  });
  const maxRow = Math.max(...rowTotals, 1);
  const totalCards = rowTotals.reduce((a, b) => a + b, 0);

  if (totalCards === 0) return null;

  return (
    <div className="bg-bg-secondary rounded-xl border border-border p-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">
        {title ?? t('dashboard.cardProgress')}
      </h2>
      <div className="space-y-2">
        {levels.map(level => {
          const row = matrix[String(level)] ?? {};
          const total = rowTotals[level];
          const color = BLOOM_COLORS[level];
          return (
            <div key={level} className="flex items-center gap-3">
              <span className="text-xs w-20 text-right flex-shrink-0" style={{ color: color.text }}>
                {t(color.labelKey)}
              </span>
              <div className="flex-1 h-5 bg-bg-surface rounded-full overflow-hidden flex">
                {STATE_KEYS.map(state => {
                  const count = row[state] ?? 0;
                  if (count === 0) return null;
                  const pct = (count / maxRow) * 100;
                  return (
                    <div
                      key={state}
                      className="h-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: STATE_COLORS[state] }}
                      title={`${t(`cardStates.${state}`)}: ${count}`}
                    />
                  );
                })}
              </div>
              <span className="text-xs text-text-muted w-8 text-right tabular-nums flex-shrink-0">{total}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4">
        {STATE_KEYS.map(state => (
          <div key={state} className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATE_COLORS[state] }} />
            <span>{t(`cardStates.${state}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
