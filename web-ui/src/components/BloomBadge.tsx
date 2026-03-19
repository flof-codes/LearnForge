import { useTranslation } from 'react-i18next';
import { BLOOM_COLORS } from '../types';

interface BloomBadgeProps {
  level: number;
  showLabel?: boolean;
}

export default function BloomBadge({ level, showLabel = false }: BloomBadgeProps) {
  const { t } = useTranslation('app');
  const color = BLOOM_COLORS[level] ?? BLOOM_COLORS[0];
  const label = t(color.labelKey);
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color.text }}
      />
      {showLabel && (
        <span className="text-xs" style={{ color: color.text }}>
          {label}
        </span>
      )}
    </span>
  );
}
