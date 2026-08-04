import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFocusForTopic } from '../hooks/useFocus';
import { useNow } from '../hooks/useNow';

interface Props {
  topicId: string | undefined;
  size?: 'sm' | 'md';
}

function formatExpiry(iso: string | null, now: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return t('focus.indefinite');
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return t('focus.expired');
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('focus.expiresInMinutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('focus.expiresInHours', { count: hours });
  const days = Math.round(hours / 24);
  return t('focus.expiresInDays', { count: days });
}

export default function FocusBadge({ topicId, size = 'sm' }: Props) {
  const { t } = useTranslation('app');
  const focus = useFocusForTopic(topicId);
  const now = useNow();
  if (!focus) return null;

  const iconSize = size === 'sm' ? 10 : 12;
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  const tooltip = focus.inherited
    ? `${t('focus.inheritedTooltip', { priority: focus.priority })} · ${formatExpiry(focus.expires_at, now, t)}`
    : `${t('focus.directTooltip', { priority: focus.priority })} · ${formatExpiry(focus.expires_at, now, t)}`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded font-medium tabular-nums shrink-0 ${textSize} ${padding} ${
        focus.inherited
          ? 'bg-warning/10 text-warning/70'
          : 'bg-warning/20 text-warning'
      }`}
      title={tooltip}
    >
      <Star size={iconSize} className={focus.inherited ? '' : 'fill-current'} />
      {focus.priority}
    </span>
  );
}
