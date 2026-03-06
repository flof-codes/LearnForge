import { BLOOM_COLORS } from '../types';

interface BloomBadgeProps {
  level: number;
  showLabel?: boolean;
}

export default function BloomBadge({ level, showLabel = false }: BloomBadgeProps) {
  const color = BLOOM_COLORS[level] ?? BLOOM_COLORS[0];
  return (
    <span className="inline-flex items-center gap-1.5" title={color.label}>
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color.text }}
      />
      {showLabel && (
        <span className="text-xs" style={{ color: color.text }}>
          {color.label}
        </span>
      )}
    </span>
  );
}
