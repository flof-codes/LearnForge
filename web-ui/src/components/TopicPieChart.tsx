import { useTranslation } from 'react-i18next';
import type { Topic } from '../types';
import { formatPercent } from '../utils/format';

const TOPIC_COLORS = [
  '#58a6ff', // blue
  '#56d364', // green
  '#bc8cff', // purple
  '#d29922', // amber
  '#f78166', // orange
  '#58c4dc', // cyan
  '#8b9cf0', // indigo
  '#db6d9a', // rose
];

interface TopicPieChartProps {
  topics: Topic[];
}

export default function TopicPieChart({ topics }: TopicPieChartProps) {
  const { t, i18n } = useTranslation('app');
  const withCards = topics
    .filter(t => t.cardCount > 0)
    .sort((a, b) => b.cardCount - a.cardCount);

  if (withCards.length === 0) return null;

  const totalCards = withCards.reduce((sum, t) => sum + t.cardCount, 0);

  // Cap at 7 visible + "Other"
  let slices: { name: string; count: number }[];
  if (withCards.length <= 8) {
    slices = withCards.map(t => ({ name: t.name, count: t.cardCount }));
  } else {
    const top = withCards.slice(0, 7);
    const rest = withCards.slice(7).reduce((sum, t) => sum + t.cardCount, 0);
    slices = [
      ...top.map(t => ({ name: t.name, count: t.cardCount })),
      { name: t('topicPieChart.other'), count: rest },
    ];
  }

  const cx = 100;
  const cy = 100;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  // Precompute slice lengths and cumulative offsets outside JSX
  const sliceData: { len: number; offset: number }[] = [];
  let cumulative = 0;
  for (const slice of slices) {
    const len = (slice.count / totalCards) * circumference;
    sliceData.push({ len, offset: -cumulative });
    cumulative += len;
  }

  return (
    <div className="lf-panel">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4">
        {t('topicPieChart.title')}
      </h2>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 200" className="w-36 h-36 md:w-48 md:h-48">
          <g transform="rotate(-90 100 100)">
            {sliceData.map((d, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                strokeWidth={40}
                strokeDasharray={`${d.len} ${circumference - d.len}`}
                strokeDashoffset={d.offset}
                className="transition-all duration-500"
              />
            ))}
          </g>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-current text-text-primary"
            style={{ fontSize: '28px', fontWeight: 300 }}
          >
            {totalCards}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-current text-text-muted"
            style={{ fontSize: '11px' }}
          >
            {t('topicPieChart.cards')}
          </text>
        </svg>
        {/* Phone: one full-width row per topic with the whole name. From md up: the compact wrapped legend. */}
        <div className="w-full divide-y divide-border mt-4 md:w-auto md:divide-y-0 md:flex md:flex-wrap md:justify-center md:gap-x-5 md:gap-y-1.5">
          {slices.map((slice, i) => {
            const pct = Math.round((slice.count / totalCards) * 1000) / 10;
            return (
              <div key={i} className="flex items-center gap-2 py-2 text-xs text-text-muted md:py-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: TOPIC_COLORS[i % TOPIC_COLORS.length] }}
                />
                <span className="flex-1 min-w-0 text-sm text-text-primary md:flex-none md:text-xs md:text-text-muted md:truncate md:max-w-[120px]">{slice.name}</span>
                <span className="tabular-nums md:hidden">{slice.count}</span>
                <span className="tabular-nums w-12 text-right md:w-auto">{formatPercent(pct, i18n.language)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
