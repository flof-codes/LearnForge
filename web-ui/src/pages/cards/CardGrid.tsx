import CardPreview from './CardPreview';
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
  const cardIds = cards.map(c => c.id);

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
          cardIds={cardIds}
        />
      ))}
    </div>
  );
}
