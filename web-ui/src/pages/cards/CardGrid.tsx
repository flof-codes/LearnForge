import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CardPreview from './CardPreview';
import BloomBadge from '../../components/BloomBadge';
import FocusBadge from '../../components/FocusBadge';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { Topic } from '../../types';

interface CardData {
  id: string;
  concept: string;
  frontHtml?: string;
  topicId?: string;
  bloomState?: { currentLevel: number };
  tags: string[];
  fsrsState?: { due: string };
}

interface Props {
  cards: CardData[];
  topics?: Topic[];
}

function buildBreadcrumb(topicId: string, topics: Topic[]): string {
  const map = new Map(topics.map(t => [t.id, t]));
  const parts: string[] = [];
  let current = map.get(topicId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return parts.join(' → ');
}

export default function CardGrid({ cards, topics }: Props) {
  const { t } = useTranslation('app');
  const isPhone = useIsPhone();
  const cardIds = cards.map(c => c.id);

  // Phone: text rows. A preview is one iframe per card, scaled down until the
  // text is unreadable, and a page holds 25 or more of them.
  if (isPhone) {
    return (
      <div className="lf-bleed bg-bg-secondary border-y border-border divide-y divide-border">
        {cards.map(card => {
          const isDue = card.fsrsState ? new Date(card.fsrsState.due) <= new Date() : false;
          const topicPath = card.topicId && topics ? buildBreadcrumb(card.topicId, topics) : '';
          const meta = [topicPath, (card.tags ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
          return (
            <Link
              key={card.id}
              to={`/dashboard/cards/${card.id}`}
              state={{ cardIds }}
              className="flex items-start gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">{card.concept}</p>
                {meta && <p className="text-xs text-text-muted truncate mt-0.5">{meta}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0 pt-1">
                <div className="flex items-center gap-1.5">
                  <FocusBadge topicId={card.topicId} />
                  <BloomBadge level={card.bloomState?.currentLevel ?? 0} />
                </div>
                {isDue && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning">{t('cards.dueLabel')}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(card => (
        <CardPreview
          key={card.id}
          id={card.id}
          frontHtml={card.frontHtml}
          bloomLevel={card.bloomState?.currentLevel ?? 0}
          tags={card.tags ?? []}
          isDue={card.fsrsState ? new Date(card.fsrsState.due) <= new Date() : false}
          topicPath={card.topicId && topics ? buildBreadcrumb(card.topicId, topics) : undefined}
          topicId={card.topicId}
          cardIds={cardIds}
        />
      ))}
    </div>
  );
}
