import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CardHtmlRender from '../../components/CardHtmlRender';
import RatingButtons from '../../components/RatingButtons';
import type { DueCard } from '../../types';

interface Props {
  card: DueCard;
  onRate: (rating: 1 | 2 | 3 | 4) => void;
  onViewDetail?: () => void;
  disabled?: boolean;
}

export default function InteractiveCard({ card, onRate, onViewDetail, disabled }: Props) {
  const { t } = useTranslation('app');
  const [flipped, setFlipped] = useState(false);

  // Reset flip state when card changes
  useEffect(() => {
    setFlipped(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [card.id]);

  // Space key to flip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setFlipped(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Card */}
      <div className="bg-bg-secondary rounded-xl border border-border p-6 relative pb-16">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            {flipped ? t('study.back') : t('study.front')}
          </div>
          {onViewDetail && (
            <button
              onClick={onViewDetail}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent-blue transition-colors"
              title={t('study.viewDetails')}
            >
              <Info size={14} /> {t('study.details')}
            </button>
          )}
        </div>

        {flipped ? (
          <CardHtmlRender html={card.backHtml} interactive />
        ) : (
          <CardHtmlRender html={card.frontHtml} interactive />
        )}

        {/* Page-peel flip corner */}
        <button
          onClick={() => setFlipped(prev => !prev)}
          className="absolute bottom-0 right-0 group"
          title={t('study.flipCard')}
        >
          {/* Folded corner triangle */}
          <svg width="56" height="56" viewBox="0 0 56 56" className="transition-transform duration-200 group-hover:scale-110 origin-bottom-right">
            {/* Shadow beneath the fold */}
            <path
              d="M56 0 L56 56 L0 56 Z"
              fill="rgba(0,0,0,0.15)"
            />
            {/* The folded page */}
            <path
              d="M56 4 L56 56 L4 56 Z"
              className="fill-bg-surface group-hover:fill-bg-hover transition-colors"
            />
            {/* Fold crease highlight */}
            <path
              d="M56 4 L4 56"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              fill="none"
            />
          </svg>
          {/* Flip icon */}
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute bottom-2.5 right-2.5 text-text-muted group-hover:text-text-primary transition-colors"
          >
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
      </div>

      {/* Rating buttons — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-bg-primary/90 backdrop-blur-sm border-t border-border py-3 px-4 z-40">
        <div className="max-w-2xl mx-auto">
          <RatingButtons onRate={onRate} disabled={disabled} />
        </div>
      </div>
    </>
  );
}
