// --- Card History ---
export type CardHistoryRange = '30d' | '1y' | 'all';
export const HISTORY_STATES = ['new', 'learning', 'relearning', 'recall', 'shortTerm', 'midTerm', 'longTerm'] as const;
export type HistoryState = (typeof HISTORY_STATES)[number];
export type CardHistoryPoint = { at: string; total: number } & Record<HistoryState, number>;

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
  points: CardHistoryPoint[];
}
