import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RatingButtonsProps {
  onRate: (rating: 1 | 2 | 3 | 4) => void;
  disabled?: boolean;
}

const ratings = [
  { value: 1 as const, labelKey: 'ratings.again', bg: '#da3633', shortcut: 'A' },
  { value: 2 as const, labelKey: 'ratings.hard', bg: '#d29922', shortcut: 'S' },
  { value: 3 as const, labelKey: 'ratings.good', bg: '#2ea043', shortcut: 'D' },
  { value: 4 as const, labelKey: 'ratings.easy', bg: '#58a6ff', shortcut: 'F' },
];

// Map keys to rating values — letters (home row) + numbers as fallback
const KEY_MAP: Record<string, 1 | 2 | 3 | 4> = {
  a: 1, s: 2, d: 3, f: 4,
  '1': 1, '2': 2, '3': 3, '4': 4,
};
const CODE_MAP: Record<string, 1 | 2 | 3 | 4> = {
  KeyA: 1, KeyS: 2, KeyD: 3, KeyF: 4,
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
};

export default function RatingButtons({ onRate, disabled }: RatingButtonsProps) {
  const { t } = useTranslation('app');
  const onRateRef = useRef(onRate);
  const disabledRef = useRef(disabled);
  onRateRef.current = onRate; // eslint-disable-line react-hooks/refs
  disabledRef.current = disabled; // eslint-disable-line react-hooks/refs

  const [activeKey, setActiveKey] = useState(0);
  const activeKeyRef = useRef(setActiveKey);
  activeKeyRef.current = setActiveKey; // eslint-disable-line react-hooks/refs

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (disabledRef.current) return;

      const rating = KEY_MAP[e.key.toLowerCase()] ?? CODE_MAP[e.code] ?? null;
      if (!rating) return;

      e.preventDefault();
      e.stopPropagation();
      activeKeyRef.current(rating);
      setTimeout(() => activeKeyRef.current(0), 150);
      onRateRef.current(rating);
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  return (
    <div className="flex gap-3">
      {ratings.map(({ value, labelKey, bg, shortcut }) => (
        <button
          key={value}
          onClick={() => onRate(value)}
          disabled={disabled}
          className={`flex-1 py-3 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 ${
            activeKey === value ? 'scale-95 brightness-125' : ''
          }`}
          style={{ backgroundColor: bg }}
        >
          {t(labelKey)}
          <span className="block text-xs opacity-70 mt-0.5">{shortcut}</span>
        </button>
      ))}
    </div>
  );
}
