import type { AnswerMode, ChoicePayload, GapPayload } from '../types';

/** Headspace presets: anchor points on the session difficulty, as in the chat tutor. */
export const HEADSPACE = [
  { key: 'commute', value: 0.3 },
  { key: 'desk', value: 0.7 },
  { key: 'deep', value: 1 },
] as const;
/** Follow-up questions per open answer; the server enforces the same number. */
export const FOLLOW_UP_LIMIT = 5;
export const DIFFICULTY_MIN = 0.3;
export const DIFFICULTY_MAX = 1;
export const DIFFICULTY_STEP = 0.05;
export const DIFFICULTY_TICKS = [0.3, 0.5, 0.7, 0.85, 1];

export type Band = 'commute' | 'desk' | 'deep';
export const bandOf = (difficulty: number): Band => (difficulty < 0.5 ? 'commute' : difficulty < 0.85 ? 'desk' : 'deep');
export const presetOf = (difficulty: number) => HEADSPACE.find(h => Math.abs(h.value - difficulty) < 0.001)?.key ?? null;
/** The factor a session's difficulty puts on every review interval. */
export const intervalFactor = (difficulty: number) => 0.8 + 0.4 * difficulty;

export interface TutorSettings { difficulty: number; answerBy: AnswerMode[] }
const DEFAULTS: TutorSettings = { difficulty: 0.7, answerBy: ['tap'] };
const STORAGE_KEY = 'learnforge_tutor_settings';
const MODES: AnswerMode[] = ['tap', 'type', 'dictate'];

function clean(raw: Partial<TutorSettings> | null): TutorSettings {
  const d = Number(raw?.difficulty);
  const difficulty = Number.isFinite(d) ? Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, d)) : DEFAULTS.difficulty;
  const answerBy = MODES.filter(m => raw?.answerBy?.includes(m));
  return { difficulty, answerBy: answerBy.length > 0 ? answerBy : DEFAULTS.answerBy };
}

export function loadTutorSettings(): TutorSettings {
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULTS;
  }
}

export function saveTutorSettings(settings: TutorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private window without storage: the settings just do not persist.
  }
}

export function settingsToParams(settings: TutorSettings, params: URLSearchParams): void {
  params.set('d', settings.difficulty.toFixed(2));
  params.set('by', settings.answerBy.join(','));
}

export function settingsFromParams(params: URLSearchParams): TutorSettings | null {
  if (!params.has('d')) return null;
  return clean({ difficulty: Number(params.get('d')), answerBy: (params.get('by') ?? '').split(',') as AnswerMode[] });
}

// --- Grading on the client, for instant feedback. The server grades again when the review is saved. ---

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function gradeChoice(payload: ChoicePayload, picked: number[]): number {
  const correct = payload.options.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
  if (correct.length === 1) return picked.length === 1 && picked[0] === correct[0] ? 1 : 0;
  const hits = picked.filter(i => correct.includes(i)).length;
  return Math.max(0, (hits - (picked.length - hits)) / correct.length);
}

export function normalizeGapAnswer(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(/^[\s"'„“”‚‘’.,;:!?()]+|[\s"'„“”‚‘’.,;:!?()]+$/g, '');
}

export function gradeGap(payload: GapPayload, text: string): number {
  const given = normalizeGapAnswer(text);
  return given !== '' && payload.accept.includes(given) ? 1 : 0;
}

/** Same thresholds as the server. A term looked up before answering caps a full score at Good. */
export function suggestedRating(correctness: number, lookedUp: boolean): 1 | 2 | 3 | 4 {
  const rating = correctness >= 0.95 ? 4 : correctness >= 0.8 ? 3 : correctness >= 0.5 ? 2 : 1;
  return lookedUp && rating === 4 ? 3 : rating;
}

/** What to tell the learner when a tutor request failed: the server names model faults by code. */
export function tutorErrorKey(error: unknown): string {
  const data = (error as { response?: { status?: number; data?: { code?: string } } }).response;
  if (data?.data?.code === 'TUTOR_CREDITS') return 'tutor.pausedCredits';
  if (data?.data?.code?.startsWith('TUTOR_')) return 'tutor.modelError';
  if (data?.status === 404) return 'tutor.questionGone';
  return 'tutor.saveFailed';
}
