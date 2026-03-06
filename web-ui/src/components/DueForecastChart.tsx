import { useState } from 'react';
import { useDueForecast } from '../hooks/useStudy';

interface DueForecastChartProps {
  topicId?: string;
}

export default function DueForecastChart({ topicId }: DueForecastChartProps) {
  const [range, setRange] = useState<'month' | 'year'>('month');
  const { data, isLoading } = useDueForecast(topicId, range);

  if (isLoading || !data) return null;

  const maxCount = Math.max(...data.buckets.map(b => b.count), 1);
  const hasData = data.buckets.some(b => b.count > 0) || data.overdue > 0;

  if (!hasData) return null;

  return (
    <div className="bg-bg-secondary rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">Due Forecast</h2>
          {data.overdue > 0 && (
            <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-danger/15 text-danger">
              {data.overdue} overdue
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['month', 'year'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                range === r
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-bg-surface text-text-muted hover:text-text'
              }`}
            >
              {r === 'month' ? '30 Days' : '12 Months'}
            </button>
          ))}
        </div>
      </div>

      {/* Y-axis max label */}
      <div className="flex items-end gap-1 h-32">
        <div className="flex flex-col justify-between h-full text-right pr-1 w-6 shrink-0">
          <span className="text-[10px] text-text-muted tabular-nums leading-none">{maxCount}</span>
          <span className="text-[10px] text-text-muted tabular-nums leading-none">0</span>
        </div>

        {/* Bars */}
        <div className="flex-1 flex items-end gap-px h-full">
          {data.buckets.map(bucket => {
            const pct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
            return (
              <div
                key={bucket.date}
                className="flex-1 flex flex-col justify-end h-full group relative"
              >
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: `${Math.max(pct, bucket.count > 0 ? 2 : 0)}%`,
                    backgroundColor: '#58a6ff',
                    minHeight: bucket.count > 0 ? '2px' : '0px',
                  }}
                />
                {/* Tooltip */}
                {bucket.count > 0 && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                    <div className="bg-bg-surface border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                      <span className="text-text-muted">{bucket.label}:</span>{' '}
                      <span className="tabular-nums font-medium">{bucket.count}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex gap-px ml-7">
        {data.buckets.map((bucket, i) => {
          const showLabel = range === 'year'
            || (range === 'month' && (i === 0 || i === 9 || i === 19 || i === 29));
          return (
            <div key={bucket.date} className="flex-1 text-center">
              {showLabel && (
                <span className="text-[10px] text-text-muted">{bucket.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
