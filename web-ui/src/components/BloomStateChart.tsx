import { type ReactNode, useState } from 'react';
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

function Tip({ children, text, align = 'center', className }: { children: ReactNode; text: string; align?: 'left' | 'center'; className?: string }) {
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

  const posClass = align === 'left'
    ? 'left-0'
    : 'left-1/2 -translate-x-1/2';

  return (
    <div className={`relative ${className ?? ''}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {show && (
        <span className={`pointer-events-none absolute bottom-full ${posClass} mb-1.5 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white z-10`}>
          {text}
        </span>
      )}
    </div>
  );
}

function BarSegment({ text, style }: { text: string; style: React.CSSProperties }) {
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
      className="relative h-full transition-all duration-500"
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white z-10">
          {text}
        </span>
      )}
    </div>
  );
}

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

  const stateTotals = Object.fromEntries(
    STATE_KEYS.map(k => [k, levels.reduce((sum, l) => sum + ((matrix[String(l)] ?? {})[k] ?? 0), 0)])
  );

  // Show levels 0 through the highest level that has cards
  const maxLevel = levels.reduce((max, l) => rowTotals[l] > 0 ? l : max, -1);

  if (totalCards === 0) return null;

  return (
    <div className="bg-bg-secondary rounded-xl border border-border p-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">
        {title ?? t('dashboard.cardProgress')}
      </h2>
      <div className="space-y-2">
        {levels.map(level => {
          if (level > maxLevel) return null;
          const row = matrix[String(level)] ?? {};
          const total = rowTotals[level];
          const color = BLOOM_COLORS[level];
          const presentStates = STATE_KEYS.filter(s => (row[s] ?? 0) > 0);
          return (
            <div key={level} className="flex items-center gap-3">
              <Tip text={t(`bloomDesc.${level}`)} align="left" className="w-20 flex-shrink-0">
                <span className="text-xs text-right block cursor-default text-text-primary">
                  {t(color.labelKey)}
                </span>
              </Tip>
              <div className="flex-1 h-5 bg-bg-surface rounded-full flex">
                {presentStates.map((state, i) => {
                  const count = row[state] ?? 0;
                  const pct = (count / maxRow) * 100;
                  const isFirst = i === 0;
                  const isLast = i === presentStates.length - 1;
                  return (
                    <BarSegment
                      key={state}
                      text={`${t(`cardStates.${state}`)}: ${count}`}
                      style={{
                        width: `${pct}%`,
                        minWidth: '8px',
                        backgroundColor: STATE_COLORS[state],
                        borderRadius: isFirst && isLast ? '9999px'
                          : isFirst ? '9999px 0 0 9999px'
                          : isLast ? '0 9999px 9999px 0'
                          : undefined,
                      }}
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
        {STATE_KEYS.filter(state => stateTotals[state] > 0).map(state => (
          <Tip key={state} text={t(`cardStateDesc.${state}`)}>
            <div className="flex items-center gap-2 text-xs text-text-muted cursor-default">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATE_COLORS[state] }} />
              <span>{t(`cardStates.${state}`)} {stateTotals[state]}</span>
            </div>
          </Tip>
        ))}
      </div>
    </div>
  );
}
