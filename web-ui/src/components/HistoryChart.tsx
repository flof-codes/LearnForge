import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from '../hooks/useStudy';
import {
  CARD_STATE_COLORS, DUE_STATES, HISTORY_STATES, REVIEW_STATES, type CardHistoryRange, type HistoryKind, type HistoryPoint, type HistoryState,
} from '../types';

// Per kind: its bands, its i18n section (title, total label), and bars for
// counts per day instead of areas for a state at each point.
const KINDS: Record<HistoryKind, { states: readonly HistoryState[]; i18n: string; bars?: boolean }> = {
  cards: { states: HISTORY_STATES, i18n: 'cardHistory' },
  due: { states: DUE_STATES, i18n: 'dueHistory' },
  reviews: { states: REVIEW_STATES, i18n: 'reviewHistory', bars: true },
};
const RANGES: { key: CardHistoryRange; label: string }[] = [
  { key: '30d', label: 'cardHistory.thirtyDays' },
  { key: '1y', label: 'cardHistory.oneYear' },
  { key: 'all', label: 'cardHistory.all' },
];

/** A round, even axis maximum at least the largest total, so the middle gridline is a whole number. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const nice = [2, 4, 6, 8, 10].find(m => m * pow >= value) ?? 10;
  return nice * pow;
}

/** Path of one band: its top edge left to right, then its bottom edge back. */
function bandPath(points: HistoryPoint[], below: number[], above: number[], yMax: number): string {
  const n = points.length;
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / yMax) * 100;
  const top = above.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join('');
  const bottom = below.map((v, i) => `L${x(i)},${y(v)}`).reverse().join('');
  return `${top}${bottom}Z`;
}

/** Path of one band as bars: a rectangle per point, with a gap while bars are wide enough. */
function barPath(below: number[], above: number[], yMax: number): string {
  const n = above.length;
  const w = 100 / n;
  const gap = n <= 60 ? w * 0.15 : 0;
  const y = (v: number) => 100 - (v / yMax) * 100;
  return above.map((v, i) => (v > below[i]
    ? `M${i * w + gap},${y(v)}H${(i + 1) * w - gap}V${y(below[i])}H${i * w + gap}Z`
    : '')).join('');
}

interface Props {
  kind: HistoryKind;
  /** Inside another block on a phone: no panel frame of its own. */
  embedded?: boolean;
}

export default function HistoryChart({ kind, embedded }: Props) {
  const { t, i18n } = useTranslation('app');
  const [range, setRange] = useState<CardHistoryRange>('all');
  const [picked, setPicked] = useState<number | null>(null);
  const { data, isLoading } = useHistory(kind, range);
  const { states, i18n: section, bars } = KINDS[kind];
  // Most settled at the bottom, so the stack reads from consolidated up to new.
  const stack = [...states].reverse();

  const points = data?.points ?? [];
  const n = points.length;
  const yMax = niceMax(Math.max(0, ...points.map(p => p.total)));
  const index = picked !== null && picked < n ? picked : n - 1;
  const current = points[index];

  // Cumulative heights per band, bottom up.
  const bands: { state: HistoryState; below: number[]; above: number[] }[] = [];
  let running = points.map(() => 0);
  for (const state of stack) {
    const above = points.map((p, i) => running[i] + (p[state] ?? 0));
    bands.push({ state, below: running, above });
    running = above;
  }
  // Where point i sits, in percent: on the edges for areas, mid-slot for bars.
  const xAt = (i: number) => (bars ? ((i + 0.5) / n) * 100 : n === 1 ? 0 : (i / (n - 1)) * 100);
  const totalLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${100 - (p.total / yMax) * 100}`).join('');

  // Bars are calendar days sent as UTC noon; read them in UTC so no time zone shifts the date.
  const timeZone = bars ? 'UTC' : undefined;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: range === '30d' ? undefined : 'numeric', timeZone });
  const fullFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone });
  const xLabels = [...new Set(n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0])];

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const i = bars ? Math.floor(frac * n) : Math.round(frac * (n - 1));
    setPicked(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className={embedded ? 'px-4 py-4' : 'lf-panel'}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">{t(`${section}.title`)}</h2>
        <div className="flex gap-1 shrink-0">
          {RANGES.map(r => (
            <button
              key={r.key}
              aria-pressed={range === r.key}
              onClick={() => { setRange(r.key); setPicked(null); }}
              className={`text-xs px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                range === r.key
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-bg-surface text-text-muted hover:text-text'
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Readout: the picked day, the latest one until something is picked */}
      <p className="text-xs mb-2 h-4">
        {current && (
          <>
            <span className="text-text-muted">
              {fullFormat.format(new Date(current.at))}
              {bars && data?.step === 'week' && ` – ${fullFormat.format(new Date(Date.parse(current.at) + 6 * 86_400_000))}`} ·{' '}
            </span>
            <span className="tabular-nums">{t(`${section}.total`)} {current.total}</span>
          </>
        )}
      </p>

      <div className="flex gap-1.5 h-40 md:h-48">
        <div className="flex flex-col justify-between h-full text-right w-8 shrink-0">
          {n > 0 && [yMax, yMax / 2, 0].map(v => (
            <span key={v} className="text-[10px] text-text-muted tabular-nums leading-none">{v}</span>
          ))}
        </div>
        <div
          className="relative flex-1 min-w-0 h-full touch-pan-y"
          onPointerDown={pick}
          onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons > 0) pick(e); }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setPicked(null); }}
        >
          <div className="absolute inset-x-0 top-0 border-t border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          {isLoading || !data ? (
            <div className="absolute inset-0 animate-pulse bg-bg-surface/40 rounded" />
          ) : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
              {bands.map(b => (
                <path
                  key={b.state}
                  d={bars ? barPath(b.below, b.above, yMax) : bandPath(points, b.below, b.above, yMax)}
                  fill={CARD_STATE_COLORS[b.state]}
                  fillOpacity={0.85}
                />
              ))}
              {!bars && <path d={totalLine} fill="none" stroke="var(--color-text-primary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            </svg>
          )}
          {current && bars && (
            <div
              className="absolute top-0 bottom-0 bg-text-primary/10 pointer-events-none"
              style={{ left: `${(index / n) * 100}%`, width: `${100 / n}%` }}
            />
          )}
          {current && !bars && n > 1 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-text-primary/60 pointer-events-none"
              style={{ left: `${xAt(index)}%` }}
            />
          )}
        </div>
      </div>

      {/* X axis: first, middle and last date; the outer ones hang inward */}
      <div className="relative h-4 mt-1 ml-[2.375rem]">
        {n > 0 && xLabels.map((i, k) => (
          <span
            key={i}
            className={`absolute text-[10px] text-text-muted whitespace-nowrap ${k === 0 ? '' : k === xLabels.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${xAt(i)}%` }}
          >
            {dateFormat.format(new Date(points[i].at))}
          </span>
        ))}
      </div>

      {/* Legend doubles as the readout: each state's count on the picked day */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 md:flex md:flex-wrap mt-3">
        {states.map(state => (
          <div key={state} className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CARD_STATE_COLORS[state] }} />
            <span>{t(`cardStates.${state}`)}</span>
            <span className="tabular-nums ml-auto md:ml-0 text-text-primary">{current?.[state] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
