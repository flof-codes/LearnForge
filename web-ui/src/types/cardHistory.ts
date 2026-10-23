// --- Card History ---
export type CardHistoryRange = '30d' | '1y' | 'all';
export const HISTORY_STATES = ['new', 'learning', 'relearning', 'recall', 'shortTerm', 'midTerm', 'longTerm'] as const;
export type HistoryState = (typeof HISTORY_STATES)[number];

/** All cards or only the due ones at each point, or the reviews done per day. */
export type HistoryKind = 'cards' | 'due' | 'reviews';
/** The states that feed the due count. */
export const DUE_STATES = ['learning', 'relearning', 'recall'] as const;
/** A review's kind: the card's state before it, review cards by their stability then. */
export const REVIEW_STATES = ['new', 'learning', 'relearning', 'shortTerm', 'midTerm', 'longTerm'] as const;
export type HistoryPoint = { at: string; total: number } & Partial<Record<HistoryState, number>>;

/** Shared by the Bloom × state bars and the card history areas. */
export const CARD_STATE_COLORS: Record<HistoryState, string> = {
  new:         '#DBEAFE',
  learning:    '#60A5FA',
  relearning:  '#2563EB',
  recall:      '#1E3A8A',
  shortTerm:   '#6EE7B7',
  midTerm:     '#22C68D',
  longTerm:    '#059669',
};

export interface CardHistory {
  range: CardHistoryRange;
  step: 'day' | 'week';
  points: HistoryPoint[];
}
