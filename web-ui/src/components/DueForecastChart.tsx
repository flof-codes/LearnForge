import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDueForecast } from '../hooks/useStudy';

interface DueForecastChartProps {
  topicId?: string;
}

interface Bucket {
  date: string;
  label: string;
  count: number;
}

// Bucket dates are "YYYY-MM-DD" (30 days) or "YYYY-MM" (12 months). The API's
// own labels are English, so the axis is formatted here in the UI language.
function bucketDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

function ForecastBar({ bucket, pct, label, selected }: { bucket: Bucket; pct: number; label: string; selected: boolean }) {
  const [show, setShow] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = () => {
    const id = setTimeout(() => setShow(true), 200);
    setTimer(id);
  };
  const onLeave = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setShow(false);
  };

  return (
    <div
      className="flex-1 flex flex-col justify-end h-full relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={() => setShow(prev => !prev)}
      tabIndex={bucket.count > 0 ? 0 : undefined}
      role={bucket.count > 0 ? 'button' : undefined}
    >
      <div
        className={`w-full rounded-t transition-all duration-300 md:opacity-100 ${selected ? 'opacity-100' : 'opacity-60'}`}
        style={{
          height: `${Math.max(pct, bucket.count > 0 ? 2 : 0)}%`,
          backgroundColor: '#58a6ff',
          minHeight: bucket.count > 0 ? '2px' : '0px',
        }}
      />
      {/* Floating tooltip from md up. A phone shows the value in the line below the chart, where it cannot leave the screen. */}
      {bucket.count > 0 && show && (
        <div className="hidden md:block pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-bg-surface border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
            <span className="text-text-muted">{label}:</span>{' '}
            <span className="tabular-nums font-medium">{bucket.count}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DueForecastChart({ topicId }: DueForecastChartProps) {
  const { t, i18n } = useTranslation('app');
  const [range, setRange] = useState<'month' | 'year'>('month');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useDueForecast(topicId, range);

  if (isLoading || !data) return null;

  const buckets: Bucket[] = data.buckets;
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const hasData = buckets.some(b => b.count > 0) || data.overdue > 0;

  if (!hasData) return null;

  const axisFormat = new Intl.DateTimeFormat(
    i18n.language,
    range === 'year' ? { month: 'short' } : { day: 'numeric', month: 'short' },
  );
  const fullFormat = new Intl.DateTimeFormat(
    i18n.language,
    range === 'year' ? { month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' },
  );

  // Phone readout: the tapped bar, or the first bar that has cards.
  const readout = buckets.find(b => b.date === selected) ?? buckets.find(b => b.count > 0);

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * buckets.length);
    setSelected(buckets[Math.min(buckets.length - 1, Math.max(0, i))].date);
  };

  const overdueChip = data.overdue > 0 && (
    <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-danger/15 text-danger whitespace-nowrap">
      {t('dueForecast.overdue', { count: data.overdue })}
    </span>
  );

  return (
    <div className="lf-panel">
      <div className="flex items-center justify-between gap-3 mb-2 md:mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">{t('dueForecast.title')}</h2>
          <span className="hidden md:inline">{overdueChip}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {(['month', 'year'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                range === r
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-bg-surface text-text-muted hover:text-text'
              }`}
            >
              {r === 'month' ? t('dueForecast.thirtyDays') : t('dueForecast.twelveMonths')}
            </button>
          ))}
        </div>
      </div>
      {/* On a phone the chip takes its own line, so the header never outgrows the screen. */}
      {overdueChip && <div className="md:hidden mb-3">{overdueChip}</div>}

      {/* Y-axis max label */}
      <div className="flex items-end gap-1 h-32">
        <div className="flex flex-col justify-between h-full text-right pr-1 w-6 shrink-0">
          <span className="text-[10px] text-text-muted tabular-nums leading-none">{maxCount}</span>
          <span className="text-[10px] text-text-muted tabular-nums leading-none">0</span>
        </div>

        {/* Bars — a tap or a drag across them picks the bar for the phone readout */}
        <div
          className="flex-1 flex items-end gap-px h-full touch-pan-y"
          onPointerDown={pick}
          onPointerMove={e => { if (e.pointerType !== 'mouse') pick(e); }}
        >
          {buckets.map(bucket => {
            const pct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
            return (
              <ForecastBar
                key={bucket.date}
                bucket={bucket}
                pct={pct}
                label={fullFormat.format(bucketDate(bucket.date))}
                selected={bucket.date === readout?.date}
              />
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex gap-px ml-7">
        {buckets.map((bucket, i) => {
          const last = buckets.length - 1;
          const showLabel = range === 'year'
            || (range === 'month' && (i === 0 || i === 9 || i === 19 || i === last));
          // The outer labels hang inward so they stay inside the plot.
          const align = range === 'year' ? 'justify-center' : i === 0 ? 'justify-start' : i === last ? 'justify-end' : 'justify-center';
          return (
            <div key={bucket.date} className={`flex-1 min-w-0 flex ${align}`}>
              {showLabel && (
                <span className="text-[10px] text-text-muted whitespace-nowrap">{axisFormat.format(bucketDate(bucket.date))}</span>
              )}
            </div>
          );
        })}
      </div>

      {readout && (
        <p className="md:hidden mt-3 text-xs bg-bg-surface rounded-md px-2.5 py-1.5">
          {fullFormat.format(bucketDate(readout.date))}
          <span className="text-text-muted"> · </span>
          <span className="tabular-nums">{t('dueForecast.cardsDue', { count: readout.count })}</span>
        </p>
      )}
    </div>
  );
}
