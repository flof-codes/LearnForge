// --- Topics ---
export interface Topic {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  createdAt: string;
  childCount: number;
  cardCount: number;
  newCount?: number;
  dueCount?: number;
}

export interface TopicWithChildren extends Topic {
  children: Topic[];
}

export interface TopicTreeNode {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  card_count: number;
  children: TopicTreeNode[];
}

export interface CreateTopicInput {
  name: string;
  description?: string;
  parentId?: string;
}

export interface UpdateTopicInput {
  name?: string;
  description?: string;
  parentId?: string;
}

// --- Cards ---
export interface Card {
  id: string;
  topicId: string;
  concept: string;
  frontHtml: string;
  backHtml: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CardWithState extends Card {
  bloomState: BloomState;
  fsrsState: FsrsState;
  reviews: Review[];
}

export interface CreateCardInput {
  topic_id: string;
  concept: string;
  front_html: string;
  back_html: string;
  tags?: string[];
}

export interface UpdateCardInput {
  concept?: string;
  front_html?: string;
  back_html?: string;
  tags?: string[];
  topic_id?: string;
}

// --- Bloom State ---
export interface BloomState {
  cardId: string;
  currentLevel: number;
  highestReached: number;
  updatedAt: string;
}

export const BLOOM_LEVELS = [
  'bloom.remember', 'bloom.understand', 'bloom.apply',
  'bloom.analyze', 'bloom.evaluate', 'bloom.create',
] as const;

export const BLOOM_COLORS: Record<number, { bg: string; text: string; labelKey: string }> = {
  0: { bg: '#0d2818', text: '#56d364', labelKey: 'bloom.remember' },
  1: { bg: '#0c2d3e', text: '#58c4dc', labelKey: 'bloom.understand' },
  2: { bg: '#1c1e3a', text: '#8b9cf0', labelKey: 'bloom.apply' },
  3: { bg: '#272450', text: '#b0a4e0', labelKey: 'bloom.analyze' },
  4: { bg: '#3b1a60', text: '#c8b8f0', labelKey: 'bloom.evaluate' },
  5: { bg: '#461860', text: '#d4b8f0', labelKey: 'bloom.create' },
};

// --- FSRS State ---
export interface FsrsState {
  cardId: string;
  stability: number;
  difficulty: number;
  due: string;
  lastReview: string | null;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
}

export const FSRS_STATE_LABELS = ['fsrs.new', 'fsrs.learning', 'fsrs.review', 'fsrs.relearning'] as const;

// --- Reviews ---
export interface Review {
  id: string;
  cardId: string;
  bloomLevel: number;
  rating: number;
  questionText: string;
  answerExpected: string | null;
  userAnswer: string | null;
  modality: "chat" | "web" | "mcq";
  reviewedAt: string;
}

export interface SubmitReviewInput {
  card_id: string;
  bloom_level: number;
  rating: number;
  question_text: string;
  answer_expected?: string;
  user_answer?: string;
  skip_bloom?: boolean;
  modality?: "chat" | "web" | "mcq";
}

export interface ReviewResponse {
  review: Review;
  fsrsState: FsrsState;
  bloomState: BloomState;
}

// --- Study ---
export interface StudySummary {
  totalCards: number;
  dueCount: number;
  newCount: number;
  bloomLevels: Record<string, number>;
  bloomStateMatrix: Record<string, Record<string, number>>;
  accuracy7d: number | null;
}

export interface StudyStats {
  streak: number;
  creationStreak: number;
  reviewsToday: number;
  cardsCreatedToday: number;
  averagePerDay: number;
  averagePerMonth: number;
  averagePerYear: number;
  dueCount: number;
  cardStates: {
    new: number;
    learning: number;
    relearning: number;
    shortTerm: number;
    midTerm: number;
    longTerm: number;
  };
}

// --- Due Forecast ---
export interface DueForecastBucket {
  label: string;
  date: string;
  count: number;
}

export interface DueForecast {
  range: 'month' | 'year';
  buckets: DueForecastBucket[];
  overdue: number;
}

// --- Due Card (flat shape from /study/due) ---
export interface DueCard {
  id: string;
  concept: string;
  frontHtml: string;
  backHtml: string;
  topicId: string;
  tags: string[];
  bloomState: { currentLevel: number; highestReached: number };
  fsrsState: { due: string; stability: number; difficulty: number; reps: number; lapses: number; state: number };
  reviews: { bloomLevel: number; rating: number; questionText: string; answerExpected: string | null; userAnswer: string | null; reviewedAt: string }[];
}

// --- Images ---
export interface ImageRecord {
  id: string;
  url: string;
  cardId: string | null;
  filename: string;
  mimeType: string;
  createdAt: string;
}

// --- User ---
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  trialEndsAt: string;
  subscriptionStatus: string | null;
  hasActiveSubscription: boolean;
  hasActiveTrial: boolean;
  isActive: boolean;
  hasStripeCustomer: boolean;
}

// --- MCP Key ---
export interface McpKeyStatus {
  hasKey: boolean;
  createdAt: string | null;
}
