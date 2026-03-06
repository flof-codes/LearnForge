// ── Deterministic UUIDs matching seed.sql ──────────────────────────────────

export const TOPICS = {
  MATHEMATICS:      "10000000-0000-0000-0000-000000000001",
  ALGEBRA:          "10000000-0000-0000-0000-000000000002",
  LINEAR_EQUATIONS: "10000000-0000-0000-0000-000000000003",
  BIOLOGY:          "10000000-0000-0000-0000-000000000004",
  CELL_BIOLOGY:     "10000000-0000-0000-0000-000000000005",
  EMPTY_TOPIC:      "10000000-0000-0000-0000-000000000006",
} as const;

export const CARDS = {
  NEW_ADDITION:       "20000000-0000-0000-0000-000000000001", // Math,   New,    Bloom 0, due past
  NEW_SUBTRACTION:    "20000000-0000-0000-0000-000000000002", // Math,   New,    Bloom 0, due past
  LRN_SOLVE_X:       "20000000-0000-0000-0000-000000000003", // Alg,    Learn,  Bloom 1, due past
  LRN_QUADRATIC:     "20000000-0000-0000-0000-000000000004", // Alg,    Learn,  Bloom 2, due future
  REV_SLOPE_INT:     "20000000-0000-0000-0000-000000000005", // LinEq,  Review, Bloom 3, due past
  REV_POINT_SLOPE:   "20000000-0000-0000-0000-000000000006", // LinEq,  Review, Bloom 4, due future
  RLRN_MULTIPLY:     "20000000-0000-0000-0000-000000000007", // Math,   Relrn,  Bloom 1, due past
  REV_DIVISION:      "20000000-0000-0000-0000-000000000008", // Math,   Review, Bloom 5, due future
  BIO_CELL_STRUCT:   "20000000-0000-0000-0000-000000000009", // Bio,    New,    Bloom 0, due past
  BIO_MITOSIS:       "20000000-0000-0000-0000-000000000010", // CellB,  Learn,  Bloom 2, due past
  BIO_DNA_REP:       "20000000-0000-0000-0000-000000000011", // CellB,  Review, Bloom 3, due past
  BIO_PHOTO_NOEMB:   "20000000-0000-0000-0000-000000000012", // Bio,    New,    Bloom 0, due past (NULL embedding)
} as const;

export const IMAGES = {
  CELL_DIAGRAM: "30000000-0000-0000-0000-000000000001", // associated with BIO_CELL_STRUCT
  STANDALONE:   "30000000-0000-0000-0000-000000000002", // orphaned (no card)
} as const;

// ── Expected seed state values ─────────────────────────────────────────────

export const SEED = {
  totalCards: 12,

  // Topic card counts (direct only)
  mathDirectCards: 4,      // cards 1,2,7,8
  algebraDirectCards: 2,   // cards 3,4
  linearDirectCards: 2,    // cards 5,6
  bioDirectCards: 2,       // cards 9,12
  cellBioDirectCards: 2,   // cards 10,11

  // Topic card counts (recursive tree rollup)
  mathTreeCards: 8,        // Math(4) + Algebra(2) + Linear(2)
  bioTreeCards: 4,         // Bio(2) + CellBio(2)
  emptyTopicCards: 0,

  // Due cards (due <= NOW, state > 0) — excludes new cards
  // Math tree due: cards 3,5,7 (state>0, past due dates)
  mathTreeDueCount: 3,
  // Bio tree due: cards 10,11 (state>0, past due dates)
  bioTreeDueCount: 2,
  // All due: 3 + 2 = 5
  totalDueCount: 5,

  // New cards (state = 0, also have due <= NOW)
  // Math tree new: cards 1,2
  mathTreeNewCount: 2,
  // Bio tree new: cards 9,12
  bioTreeNewCount: 2,
  // All new: 2 + 2 = 4
  totalNewCount: 4,

  // Total studyable (due + new) — used by /study/due endpoint
  totalStudyable: 9,
  mathTreeStudyable: 5,

  // Root topic count
  rootTopicCount: 3,       // Mathematics, Biology, Empty Topic

  // Review counts
  totalReviews: 19,   // 2+4+5+3+2+3

  // Bloom level distribution (all 12 cards)
  bloomLevels: {
    0: 4,   // cards 1,2,9,12
    1: 2,   // cards 3,7
    2: 2,   // cards 4,10
    3: 2,   // cards 5,11
    4: 1,   // card 6
    5: 1,   // card 8
  },

  // FSRS state distribution (all 12 cards)
  fsrsStates: {
    new: 4,         // state 0: cards 1,2,9,12
    learning: 3,    // state 1: cards 3,4,10
    review: 4,      // state 2: cards 5,6,8,11
    relearning: 1,  // state 3: card 7
  },
} as const;

// ── Test credentials ───────────────────────────────────────────────────────

export const TEST_CONFIG = {
  apiUrl: "http://localhost:4444",
  mcpUrl: "http://localhost:4445",
  authPassword: "test-password",
  mcpApiKey: "test-mcp-key",
  dbPort: 5555,
  dbUser: "learnforge_test",
  dbPassword: "learnforge_test",
  dbName: "learnforge_test",
} as const;
