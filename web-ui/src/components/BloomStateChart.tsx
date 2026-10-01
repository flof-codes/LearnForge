import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BLOOM_COLORS } from '../types';

const STATE_KEYS = ['new', 'learning', 'relearning', 'recall', 'shortTerm', 'midTerm', 'longTerm'] as const;

const STATE_COLORS: Record<string, string> = {
  new:         '#DBEAFE',
  learning:    '#60A5FA',
  relearning:  '#2563EB',
  recall:      '#1E3A8A',
  shortTerm:   '#6EE7B7',
  midTerm:     '#22C68D',
  longTerm:    '#059669',
};

function Tip({ children, text, align = 'center', className, onPick }: { children: ReactNode; text: string; align?: 'left' | 'center'; className?: string; onPick?: () => void }) {
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
    <div
      className={`relative ${className ?? ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={() => { setShow(prev => !prev); onPick?.(); }}
      tabIndex={0}
      role="button"
    >
      {children}
      {show && (
        <span className={`hidden md:block pointer-events-none absolute bottom-full ${posClass} mb-1.5 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white z-10`}>
          {text}
        </span>
      )}
    </div>
  );
}

function BarSegment({ text, style, onPick }: { text: string; style: React.CSSProperties; onPick: () => void }) {
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
      className="relative h-full min-w-[3px] transition-all duration-500"
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={() => { setShow(prev => !prev); onPick(); }}
      tabIndex={0}
      role="button"
    >
      {show && (
        <span className="hidden md:block pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white z-10">
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
  // Phone readout: what was tapped last. Replaces the floating tooltips, which
  // ran off the screen edge.
  const [picked, setPicked] = useState<{ level?: number; state?: string } | null>(null);

  const levels = [0, 1, 2, 3, 4, 5];
  const rowTotals = levels.map(l => {
    const row = matrix[String(l)] ?? {};
    return STATE_KEYS.reduce((sum, k) => sum + (row[k] ?? 0), 0);
  });
  const totalCards = rowTotals.reduce((a, b) => a + b, 0);

  const stateTotals = Object.fromEntries(
    STATE_KEYS.map(k => [k, levels.reduce((sum, l) => sum + ((matrix[String(l)] ?? {})[k] ?? 0), 0)])
  );

  // Show levels 0 through the highest level that has cards
  const maxLevel = levels.reduce((max, l) => rowTotals[l] > 0 ? l : max, -1);

  if (totalCards === 0) return null;

  // Derived at render, so it follows a language switch and fresh counts.
  let readout: { title: string; text: string } | null = null;
  if (picked) {
    const { level, state } = picked;
    const levelLabel = level !== undefined ? t(BLOOM_COLORS[level].labelKey) : '';
    if (level !== undefined && state) {
      readout = {
        title: `${levelLabel} · ${t(`cardStates.${state}`)}: ${(matrix[String(level)] ?? {})[state] ?? 0}`,
        text: t(`cardStateDesc.${state}`),
      };
    } else if (state) {
      readout = { title: `${t(`cardStates.${state}`)} ${stateTotals[state]}`, text: t(`cardStateDesc.${state}`) };
    } else if (level !== undefined) {
      readout = { title: levelLabel, text: t(`bloomDesc.${level}`) };
    }
  }

  return (
    <div className="lf-panel">
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
            <div key={level} className="flex items-center gap-2 md:gap-3">
              <Tip
                text={t(`bloomDesc.${level}`)}
                align="left"
                className="w-[4.75rem] md:w-20 flex-shrink-0"
                onPick={() => setPicked({ level })}
              >
                <span className="text-xs md:text-right block cursor-default text-text-primary">
                  {t(color.labelKey)}
                </span>
              </Tip>
              {/* Every row fills the track and shows its mix of states; the count on the right carries the size. */}
              <div className={`flex-1 min-w-0 h-5 flex gap-0.5 ${total === 0 ? 'bg-bg-surface rounded-full' : ''}`}>
                {presentStates.map((state, i) => {
                  const count = row[state] ?? 0;
                  const isFirst = i === 0;
                  const isLast = i === presentStates.length - 1;
                  return (
                    <BarSegment
                      key={state}
                      text={`${t(`cardStates.${state}`)}: ${count}`}
                      onPick={() => setPicked({ level, state })}
                      style={{
                        flex: `${count} 1 0%`,
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
      {readout && (
        <p className="md:hidden mt-3 text-xs bg-bg-surface rounded-md px-2.5 py-1.5">
          {readout.title}
          <span className="text-text-muted"> · {readout.text}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 md:flex md:flex-wrap mt-4">
        {STATE_KEYS.filter(state => stateTotals[state] > 0).map(state => (
          <Tip
            key={state}
            text={t(`cardStateDesc.${state}`)}
            onPick={() => setPicked({ state })}
          >
            <div className="flex items-center gap-2 text-xs text-text-muted cursor-default">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATE_COLORS[state] }} />
              <span>{t(`cardStates.${state}`)}</span>
              <span className="tabular-nums ml-auto md:-ml-1">{stateTotals[state]}</span>
            </div>
          </Tip>
        ))}
      </div>
    </div>
  );
}
