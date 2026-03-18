import { Link } from 'react-router-dom';
import BloomBadge from '../../components/BloomBadge';
import CardHtmlRender from '../../components/CardHtmlRender';

interface Props {
  id: string;
  frontHtml?: string;
  bloomLevel: number;
  tags: string[];
  isDue?: boolean;
  topicPath?: string;
  cardIds?: string[];
}

export default function CardPreview({ id, frontHtml, bloomLevel, tags, isDue, topicPath, cardIds }: Props) {
  return (
    <Link
      to={`/dashboard/cards/${id}`}
      state={cardIds ? { cardIds } : undefined}
      className="bg-bg-secondary rounded-xl border border-border hover:bg-bg-surface transition-colors block overflow-hidden"
    >
      {/* Front HTML preview */}
      <div className="h-36 overflow-hidden pointer-events-none p-3">
        {frontHtml ? (
          <div className="scale-[0.55] origin-top-left w-[182%]">
            <CardHtmlRender html={frontHtml} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">No preview</div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        {topicPath && (
          <p className="text-[11px] text-text-muted truncate">{topicPath}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <BloomBadge level={bloomLevel} />
          {isDue && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning">Due</span>
          )}
          {tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-xs text-text-muted bg-bg-surface px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
