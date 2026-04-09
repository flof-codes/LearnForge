// DB Schema
export * from "./db/schema/index.js";
export type { Db } from "./db/types.js";

// Errors
export { NotFoundError, ValidationError } from "./lib/errors.js";

// Utilities
export { stripHtml } from "./lib/strip-html.js";
export { validateCardHtml } from "./lib/sanitize-card-html.js";
export { verifyCardOwnership } from "./lib/card-ownership.js";

// Cloze Parser
export {
  parseClozeText,
  renderClozeHtml,
  validateClozeData,
  type ClozeData,
  type ClozeDeletion,
} from "./lib/cloze-parser.js";

// Services - Bloom
export { computeBloomTransition, type BloomTransitionResult } from "./services/bloom.js";

// Services - FSRS
export {
  createInitialFsrsState,
  processReview,
  applyModalityMultiplier,
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
export { submitReview, deleteReview, type SubmitReviewInput, type DeleteReviewOptions } from "./services/review-service.js";

// Services - Study
export { getStudyCards, getStudySummary, getDueForecast, getStudyStats } from "./services/study-service.js";

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

// Services - Backfill
export { backfillEmbeddings, type BackfillOptions, type BackfillProgress } from "./services/backfill-service.js";
