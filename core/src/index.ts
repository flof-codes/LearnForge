// DB Schema
export * from "./db/schema/index.js";
export type { Db } from "./db/types.js";

// Errors
export { NotFoundError, ValidationError } from "./lib/errors.js";

// Utilities
export { stripHtml } from "./lib/strip-html.js";
export { validateCardHtml } from "./lib/sanitize-card-html.js";
export { verifyCardOwnership } from "./lib/card-ownership.js";
export {
  checkSubscriptionAccess,
  type SubscriptionState,
  type SubscriptionCheck,
} from "./lib/subscription-gate.js";

// Cloze Parser
export {
  parseClozeText,
  renderClozeHtml,
  validateClozeData,
  type ClozeData,
  type ClozeDeletion,
} from "./lib/cloze-parser.js";

// Services - Bloom
export {
  computeBloomTransition, computeLevelStep, applyLevelStep, correctnessFromRating, ratingFromCorrectness,
  RULES_VERSION, DEFAULT_CHANGE_RATE, LEVEL_THRESHOLD, PASS_MARK,
  type BloomTransitionResult, type LevelProgressResult,
} from "./services/bloom.js";

// Services - Dials (change rate, sessions, originals)
export {
  loadTopicRates, resolveCardRate, resolveTopicRate, getEffectiveCardRate, getEffectiveTopicRate,
  setChangeRate, validateChangeRate, type EffectiveRate, type RateSource, type SetChangeRateInput,
} from "./services/change-rate.js";
export {
  startSession, getSession, getOpenQuestions, validateDifficulty, SESSION_EXPIRY_HOURS,
  type StudySession, type StartSessionInput,
} from "./services/session-service.js";
export {
  setOriginal, getCardOriginal, getCurrentOriginals, disputeOriginal, resolveDispute, markOriginalStale,
  type CardOriginal, type OriginalOption, type SetOriginalInput,
} from "./services/originals-service.js";

// Services - FSRS
export {
  createInitialFsrsState,
  processReview,
  applyModalityMultiplier,
  applyIntervalFactor,
  tutorIntervalFactor,
  intervalDays,
  WEB_INTERVAL_FACTOR,
  isValidModality,
  type FsrsDbState,
  type StudyModality,
} from "./services/fsrs.js";
export { optimizeUserParams } from "./services/fsrs-optimizer.js";

// Services - Embeddings
export { computeEmbedding, buildEmbeddingText } from "./services/embeddings.js";

// Services - Card
export {
  createCard,
  getCard,
  updateCard,
  deleteCard,
  resetCard,
  type CreateCardInput,
  type UpdateCardInput,
} from "./services/card-service.js";

// Services - Review
export { submitReview, deleteReview, gradeChoice, type SubmitReviewInput, type DeleteReviewOptions, type QuestionStyle } from "./services/review-service.js";

// Services - Study
export { getStudyCards, getStudySummary, type GetStudyCardsOptions } from "./services/study-service.js";
export { getDueForecast, getStudyStats } from "./services/study-stats.js";

// Services - Topic
export {
  listTopics,
  getTopic,
  getTopicTree,
  getTopicBreadcrumb,
  createTopic,
  updateTopic,
  deleteTopic,
  type CreateTopicInput,
  type UpdateTopicInput,
} from "./services/topic-service.js";

// Services - Context
export { getTopicContext, getSimilarCards } from "./services/context-service.js";

// Services - Search
export { searchCards } from "./services/search-service.js";

// Services - Card List (paginated browse)
export {
  listCards,
  type ListCardsInput,
  type ListCardsResult,
  type CardListStatus,
  type CardListSort,
} from "./services/card-list-service.js";

// Services - Backfill
export { backfillEmbeddings, type BackfillOptions, type BackfillProgress } from "./services/backfill-service.js";

// Services - Shares
export {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getSharePreview,
  acceptShareLink,
  type SharePreview,
  type AcceptShareOptions,
} from "./services/shares.js";

// Services - Focus
export {
  getFocusTopics,
  setFocusTopics,
  clearFocusTopics,
  getExpandedFocus,
  type FocusTopicInput,
  type FocusTopicRow,
  type ExpandedFocusEntry,
} from "./services/focus-service.js";

// Services - Auth Tokens
export {
  createAuthToken,
  consumeAuthToken,
  invalidateAuthTokens,
  hashAuthToken,
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  type AuthTokenType,
} from "./services/auth-token-service.js";

// Image utils
export { extFromMime } from "./lib/image-utils.js";

// Services - Glasses (Even Realities G2)
export {
  GLASSES_PROMPT_VERSION,
  GLASSES_CAPS,
  GLASSES_PAIR_CODE_TTL_MS,
  GLASSES_TOKEN_TTL_MS,
  hashGlassesToken,
  normalizePairCode,
  startGlassesPairing,
  pollGlassesPairing,
  claimGlassesPairing,
  resolveGlassesToken,
  listGlassesTokens,
  revokeGlassesToken,
  getGlassesCompileQueue,
  storeGlassesQuestion,
  validateGlassesQuestion,
  getGlassesBatch,
  submitGlassesAnswer,
  getGlassesSummary,
  type GlassesTokenRow,
  type GlassesTokenCheck,
  type GlassesCompileQueueEntry,
  type GlassesCompileQueueOptions,
  type StoreGlassesQuestionInput,
  type GlassesMode,
  type GlassesQuestion,
  type GlassesBatchOptions,
  type GlassesAnswerInput,
} from "./services/glasses-service.js";
