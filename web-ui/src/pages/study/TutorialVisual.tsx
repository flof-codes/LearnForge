import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TutorialVisual as Visual } from '../../types';

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : Number(n.toPrecision(3)).toString());

/** A chain of causes and effects, with arrows for what rises and falls. */
function Flow({ items }: Extract<Visual, { kind: 'flow' }>) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-text-muted" aria-hidden="true">→</span>}
          <span className="px-2.5 py-1 rounded-full border border-border bg-bg-secondary">
            {item.label}
            {item.change === 'up' && <b className="ml-1 text-accent-green">↑</b>}
            {item.change === 'down' && <b className="ml-1 text-danger">↓</b>}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Quantities side by side, scaled to the largest. */
function Bars({ bars, unit }: Extract<Visual, { kind: 'bars' }>) {
  const max = Math.max(...bars.map(b => b.value)) || 1;
  return (
    <div className="space-y-1.5 text-sm">
      {bars.map((b, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3">
          <span className="truncate text-text-muted">{b.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-3 rounded-sm bg-accent-blue" style={{ width: `${Math.max(2, (b.value / max) * 80)}%` }} />
            <span className="tabular-nums shrink-0">{fmt(b.value)}{unit ? ` ${unit}` : ''}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** A relationship to explore: the slider moves along x and reads y off the curve. */
function Curve({ points, xLabel, yLabel, markerX }: Extract<Visual, { kind: 'curve' }>) {
  const { t } = useTranslation('app');
  const id = useId();
  const [x, setX] = useState(markerX);
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const ys = points.map(p => p.y);
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys) || 1;
  const W = 320, H = 180, L = 40, R = 12, T = 14, B = 34;
  const px = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (v: number) => H - B - ((v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const yAt = (v: number) => {
    const k = points.findIndex(p => p.x >= v);
    if (k <= 0) return points[Math.max(0, k)].y;
    const a = points[k - 1], b = points[k];
    return a.y + ((v - a.x) / (b.x - a.x)) * (b.y - a.y);
  };
  const y = yAt(x);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join('');
  const step = (x1 - x0) / 100;
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md h-auto" role="img" aria-label={`${yLabel} / ${xLabel}`}>
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} className="stroke-text-muted" />
        <line x1={L} y1={T} x2={L} y2={H - B} className="stroke-text-muted" />
        <text x={L - 6} y={py(yMax) + 4} textAnchor="end" className="fill-text-muted text-[11px]">{fmt(yMax)}</text>
        <text x={L - 6} y={py(yMin) + 4} textAnchor="end" className="fill-text-muted text-[11px]">{fmt(yMin)}</text>
        <text x={px(x0)} y={H - B + 14} textAnchor="middle" className="fill-text-muted text-[11px]">{fmt(x0)}</text>
        <text x={px(x1)} y={H - B + 14} textAnchor="end" className="fill-text-muted text-[11px]">{fmt(x1)}</text>
        <text x={W - R} y={H - 4} textAnchor="end" className="fill-text-muted text-[11px]">{xLabel}</text>
        <text x={L + 4} y={T - 2} className="fill-text-muted text-[11px]">{yLabel}</text>
        <path d={path} fill="none" strokeWidth={2.5} className="stroke-accent-blue" />
        <line x1={px(x)} y1={py(y)} x2={px(x)} y2={H - B} strokeDasharray="3 3" className="stroke-text-primary" />
        <line x1={L} y1={py(y)} x2={px(x)} y2={py(y)} strokeDasharray="3 3" className="stroke-text-primary" />
        <circle cx={px(x)} cy={py(y)} r={6} className="fill-accent-blue" />
      </svg>
      <label htmlFor={id} className="flex flex-wrap items-center gap-3 text-sm">
        <span className="sr-only">{t('tutor.help.slider')}</span>
        <input id={id} type="range" min={x0} max={x1} step={step} value={x} onChange={e => setX(Number(e.target.value))} className="flex-1 min-w-36 accent-accent-blue" />
        <output className="tabular-nums text-text-muted">{xLabel} {fmt(x)} → <b className="text-text-primary">{yLabel} {fmt(y)}</b></output>
      </label>
    </div>
  );
}

export default function TutorialVisual({ visual }: { visual: Visual }) {
  return (
    <figure className="space-y-1.5">
      {visual.kind === 'flow' && <Flow {...visual} />}
      {visual.kind === 'bars' && <Bars {...visual} />}
      {visual.kind === 'curve' && <Curve {...visual} />}
      {visual.caption && <figcaption className="text-xs text-text-muted">{visual.caption}</figcaption>}
    </figure>
  );
}
