# LearnForge Competitive Landscape Analysis — March 2026

## Executive Summary

The AI-enhanced flashcard and spaced repetition market is crowded with over a dozen significant players, yet no product combines the Model Context Protocol (MCP) for deep LLM integration, the FSRS algorithm for optimal scheduling, and Bloom's Taxonomy for cognitive-level tracking in a single, self-hosted, open-source package. LearnForge occupies a unique niche at the intersection of these three capabilities, further differentiated by its novel modality-adjusted FSRS intervals — a feature with no equivalent in any competing product or published research.

---

## Market Overview

AI-powered flashcard generation has become table stakes — virtually every major platform now offers some form of automated card creation from notes, PDFs, or videos. The competitive frontier has shifted to three dimensions: **SRS algorithm quality** (FSRS vs. proprietary black boxes), **AI tutoring depth** (beyond simple generation to adaptive dialogue), and **personalization** (adjusting to individual learning patterns and modalities).

The market segments into established incumbents (Anki, Quizlet, Brainscape), AI-first challengers (RemNote, Knowt, Gizmo, StudyFetch), and niche/focused tools (Mochi, Rember, Orbit). Language learning giants (Duolingo, Memrise) and edtech platforms (Kahoot, Chegg, Vaia) also compete for adjacent mindshare. Open-source alternatives remain dominated by the Anki ecosystem, with the FSRS algorithm family (ts-fsrs, py-fsrs) emerging as a shared foundation across multiple projects.

Key market dynamics:
- Free tiers are shrinking across the board, with Knowt counter-positioning as the "free alternative"
- Chatbot tutors are polarizing — Quizlet killed Q-Chat (June 2025), while Duolingo doubled down
- Multi-modal input (PDFs, videos, handwriting, URLs) is a competitive battleground
- The flashcard app market continues to grow significantly year over year

---

## Direct Competitors

### Tier 1: Established Players

#### Anki + FSRS Ecosystem

| | |
|---|---|
| **URL** | [apps.ankiweb.net](https://apps.ankiweb.net) |
| **Pricing** | Free (desktop/Android), iOS $24.99 |
| **License** | AGPL-3.0 |
| **Users** | Millions (estimated), massive shared deck ecosystem |

Anki remains the gold standard for serious spaced repetition users. While it has no native AI capabilities, its plugin ecosystem fills the gap:

- **FSRS4Anki** — Machine learning scheduling plugin using FSRS-6 (21 parameters, trained on 700M+ reviews). Delivers 20-30% fewer reviews than SM-2 at equivalent retention.
- **AnkiGPT** — Generates cards from slides and documents. 3.2M cards generated. $5/mo for GPT-4 tier.
- **AnkiAIUtils** — AI-powered explanations and mnemonic generation.

**Strengths:** Infinite customizability, massive ecosystem, proven algorithm, free, open source.
**Weaknesses:** Steep learning curve, dated UI, no native AI, plugin fragmentation, no cloud sync without AnkiWeb.

#### Quizlet

| | |
|---|---|
| **URL** | [quizlet.com](https://quizlet.com) |
| **Pricing** | Free (limited) / Plus $2.99-7.99/mo |
| **Users** | 50M+ MAU, 300M+ registered, 700M+ study sets |

The largest flashcard platform by user count. Quizlet has invested heavily in AI with Magic Notes (auto-generation from notes/PDFs) and Quick Summary. Notably, **Q-Chat (their AI tutor) was discontinued in June 2025**, suggesting the chatbot tutor model may not scale for all platforms.

**Algorithm:** Proprietary "Memory Score" — not true interval-based SRS. Lacks the rigor of FSRS or SM-2.

**Strengths:** Massive content library, brand recognition, simple UX, strong mobile apps.
**Weaknesses:** No real SRS, killed their AI tutor, proprietary algorithm, free tier increasingly limited.

#### Brainscape

| | |
|---|---|
| **URL** | [brainscape.com](https://www.brainscape.com) |
| **Pricing** | Free / Pro $19.99/mo or $95.99/yr or $199.99 lifetime |

Brainscape uses Confidence-Based Repetition (CBR) with a 1-5 self-rating scale. Their AI features include flashcard generation from documents and a per-card Copilot AI assistant.

**Strengths:** Clean UI, AI copilot for individual cards, curated content marketplace.
**Weaknesses:** CBR is not FSRS/SM-2, expensive, no open-source option, limited AI depth.

#### SuperMemo

| | |
|---|---|
| **URL** | [supermemo.com](https://www.supermemo.com) |
| **Pricing** | Varies by platform |

The original inventor of spaced repetition (SM-2 through SM-18). Now features MemoChat AI, MemoTranslator, and an AI Assistant. However, SuperMemo remains largely Windows-focused with dated UX and a primary focus on language learning.

**Strengths:** Most sophisticated proprietary SRS algorithm (SM-18), deep SRS research heritage.
**Weaknesses:** Outdated UX, Windows-centric, niche user base, language-learning focus.

---

### Tier 2: AI-First Challengers

#### RemNote

| | |
|---|---|
| **URL** | [remnote.com](https://www.remnote.com) |
| **Pricing** | Free / Pro $8-10/mo / Pro+AI $18/mo / Lifetime $395 |

RemNote is the strongest competitor in the "notes + flashcards + SRS" integration space. It uses **FSRS-4.5** natively and offers AI flashcard generation from notes/PDFs plus an AI tutor.

**Strengths:** Deep notes-flashcard integration, FSRS-4.5, strong for knowledge workers, AI tutor.
**Weaknesses:** Not open source, not self-hostable, no MCP integration, no Bloom tracking, expensive AI tier.

#### Knowt

| | |
|---|---|
| **URL** | [knowt.com](https://knowt.com) |
| **Pricing** | Free (generous) / Premium $5/mo / Ultra $9.99/mo |
| **Users** | 5M+ |

Positioned as the "free Quizlet alternative." AI generation from PDFs, notes, and videos. The Kai chatbot is available on Ultra tier only.

**Strengths:** Generous free tier, strong student adoption, multi-modal input.
**Weaknesses:** No FSRS, proprietary algorithm, chatbot locked behind highest tier.

#### Gizmo (formerly Save All)

| | |
|---|---|
| **URL** | [gizmo.ai](https://gizmo.ai) |
| **Pricing** | Free (lives system) / Personal $0.99-1.99/mo / Unlimited $77-155/yr |

AI generation from PDFs, YouTube, and PowerPoints. Features an AI tutor and social learning capabilities.

**Strengths:** Low price point, social learning features, multi-modal input.
**Weaknesses:** No FSRS, no open source, limited SRS sophistication.

#### StudyFetch

| | |
|---|---|
| **URL** | [studyfetch.com](https://www.studyfetch.com) |
| **Pricing** | Free / Base $7.99/mo / Premium $11.99/mo |

The most comprehensive AI study suite in the market. Features Spark.E AI tutor, live lecture assistant, and AI essay grader.

**Strengths:** Broadest AI feature set, live lecture integration, essay grading.
**Weaknesses:** No FSRS, no open source, breadth over depth in SRS.

#### Scholarly.so

| | |
|---|---|
| **URL** | [scholarly.so](https://scholarly.so) |
| **Pricing** | Free (30 AI gen/mo) / Premium $12-20/mo |

Web-only platform with fast AI generation (PDF/video/image to cards in 30 seconds). Uses both GPT-4 and Claude as dual-model AI tutor.

**Strengths:** Fast generation, dual-model AI, clean interface.
**Weaknesses:** Web only, no FSRS, limited free tier, no mobile app.

---

### Tier 3: Niche/Focused

#### Rember — Closest Competitor

| | |
|---|---|
| **URL** | [rember.com](https://www.rember.com) |
| **Pricing** | Freemium |
| **Algorithm** | FSRS-5 |
| **MCP** | Yes (1 tool) |

Rember is LearnForge's closest competitor. See the [deep dive section](#closest-competitor-deep-dive-rember) below.

#### Mochi

| | |
|---|---|
| **URL** | [mochi.cards](https://mochi.cards) |
| **Pricing** | Free (offline) / Pro $5/mo |
| **Downloads** | 500K+ |

Markdown-based flashcard app with a clean, minimal UX. Uses modified SM-2 with FSRS in beta. Very limited AI features.

**Strengths:** Markdown native, clean design, offline-first, affordable.
**Weaknesses:** Minimal AI, FSRS only in beta, small feature set.

#### AlgoApp (formerly AnkiApp)

| | |
|---|---|
| **URL** | [anki-decks.com](https://anki-decks.com) |
| **Pricing** | Free / Unlimited $29.99/yr or $99.99 lifetime |

AI generation from PDFs and handwritten notes with native FSRS. Boasts 80M+ pre-made flashcards. Controversial due to name confusion with the original Anki project.

**Strengths:** Native FSRS, large pre-made library, handwriting input.
**Weaknesses:** Brand confusion issues, not open source, controversial reputation.

#### Orbit (Andy Matuschak)

| | |
|---|---|
| **URL** | [withorbit.com](https://withorbit.com) |
| **Pricing** | Free (research project) |

Research project exploring the "mnemonic medium" concept — SRS embedded directly into web articles. No AI features. Limited development activity since 2022.

**Strengths:** Innovative concept (embedded SRS), academic credibility.
**Weaknesses:** Stagnant development, no AI, research-only scope.

---

## Major Platform Analysis

These platforms compete for adjacent mindshare but are not direct SRS competitors:

| Platform | Focus | Users | AI Features | SRS Quality | Price |
|----------|-------|-------|-------------|-------------|-------|
| **Duolingo** | Language learning | 135M MAU, 12.2M paid | Birdbrain engine, Explain My Answer (GPT-4, free since Jan 2026), Roleplay, Video Call with Lily. 80% content AI-generated. Expanding to math/music. | Proprietary adaptive | Free / Super $6.99/mo / Max $14/mo |
| **Memrise** | Language learning | 72M+ registered | MemBot (GPT-3.5), AI Buddies (May 2025), native speaker videos | Proprietary | Free / Pro $39.99/mo or $79.99/yr / Lifetime $329.99 |
| **Kahoot** | Classroom quizzes | 5B+ cumulative participants | AI flashcard gen from notes/PDFs/URLs/handwriting, AI quiz generation, Notes Scanner | No true SRS | Free / Study $3.99/mo |
| **Chegg** | Homework help | Declining subscribers | Create (April 2025) — AI practice tests/flashcards, Solution Scout (multi-LLM comparison). Pivoting from homework help to AI. | None | $15.95/mo |
| **StudySmarter/Vaia** | General study | 22-40M learners | AI flashcard creator, AI topic explanations. Strong in DACH/Europe. Rebranded from StudySmarter. | Basic | Free / Premium ~$3.99-6.99/mo (annual) |
| **Cram** | Flashcards | Unknown | None | None | Free |

---

## Open-Source Landscape

### Core Algorithm Libraries

| Project | Language | Description |
|---------|----------|-------------|
| **ts-fsrs** | TypeScript | Core FSRS algorithm library. Used by LearnForge, Rember, LeetFlash, and others. |
| **py-fsrs** | Python | Python implementation of FSRS. Used in research and Anki plugin. |
| **open-spaced-repetition** | Multi | GitHub organization maintaining FSRS research, awesome-fsrs list, and algorithm papers. |

### SRS Applications

| Project | License | Notes |
|---------|---------|-------|
| **Anki** | AGPL-3.0 | Gold standard OSS SRS. Massive plugin ecosystem. FSRS via FSRS4Anki plugin. |
| **SiYuan** | AGPL-3.0 | Self-hosted note-taking with FSRS-5 integration. |
| **Logseq** | AGPL-3.0 | Knowledge management with cljc-fsrs implementation. |
| **Mochi** | Proprietary (MCP server is OSS) | Offline-first flashcards with FSRS beta. |
| **Obsidian plugins** | Various | Community plugins adding FSRS-6 to the note-taking platform. |

### MCP Learning Servers

The MCP ecosystem for learning tools is nascent:

| Server | Tools | Capabilities |
|--------|-------|-------------|
| **Rember MCP** ([github.com/rember/rember-mcp](https://github.com/rember/rember-mcp)) | 1 | `create_flashcards` only. Creates cards in Rember from Claude Desktop chats. |
| **Anki MCP servers** (multiple) | 7-22 | Bridge to Anki Desktop via AnkiConnect. CRUD operations, deck management, review. |
| **Mochi MCP** ([github.com/fredrikalindh/mcp-mochi](https://github.com/fredrikalindh/mcp-mochi)) | ~5 | Card CRUD bridge to Mochi API. |
| **LearnForge MCP** | **18+** | Full study workflow: cards, topics, reviews, study sessions, context retrieval, images, Bloom tracking. |

LearnForge's MCP server offers the deepest tool coverage of any learning-focused MCP implementation by a significant margin.

---

## Academic Research

### Key Findings

| Topic | Finding | Reference |
|-------|---------|-----------|
| **FSRS vs. SM-2** | FSRS consistently outperforms SM-2 in retention studies, achieving target retention with fewer reviews. | Ye et al., 2024 |
| **LLM-Generated Cards** | LLM-generated flashcards show comparable quality to expert-created ones, but require validation steps to catch errors. | Multiple studies, 2023-2025 |
| **Testing Effect** | Harder retrieval produces stronger memory traces — supporting the value of modality-adjusted intervals. | Roediger & Karpicke, 2006 |
| **Modality Effects** | Different study modalities (reading, active recall, MCQ) produce different memory strengths — well-established in psychology. | Multiple meta-analyses |
| **AI Tutoring + SRS** | Emerging field with mostly conceptual papers. No widely deployed system combining adaptive AI tutoring with rigorous SRS. | Various, 2024-2025 |

### Seminal Papers

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|------------------|
| SSP-MMC | Ye et al. | KDD 2022 | Foundational FSRS paper. 220M memory logs, SRS as shortest-path optimization. |
| SSP-MMC+ | Su et al. | IEEE TKDE 2023 | Extended memory dynamics for FSRS evolution. |
| MEMORIZE | Tabibian et al. | PNAS 2019 | First rigorous mathematical framework for ML-optimized SRS. Validated on Duolingo data. |
| DRL-SRS | Xiao & Wang | Applied Sciences 2024 | Transformer-based memory model + deep RL for scheduling. Cutting edge. |
| LECTOR | Anonymous | arXiv 2025 | LLM-powered semantic similarity for SRS. 90.2% success rate. Not yet commercialized. |
| AIEd Bloom's Taxonomy | Various | 2024 | Proposes Bloom + AI framework. Validates LearnForge's approach conceptually. |

### Research Gaps

These areas have no published research, representing opportunities for LearnForge to contribute:

1. **MCP + SRS integration** — No papers exist on using the Model Context Protocol for spaced repetition workflows.
2. **Modality-adjusted SRS intervals** — Despite strong psychological evidence for modality effects on memory, no SRS system has operationalized this into interval scheduling. LearnForge's approach (chat 1.2x, web 0.95x, MCQ 1.05x) is novel.
3. **Bloom's Taxonomy + computational SRS** — While Bloom's is foundational in education theory, no computational SRS system tracks per-card cognitive levels.
4. **Multimodal interactive flashcards** — Most research focuses on text-only cards. Interactive HTML cards with KaTeX/SVG are barely studied.
5. **Cognitive load-aware scheduling** — Emerging but not integrated into any commercial SRS.

---

## Feature Comparison Matrix

| Feature | Anki | Quizlet | RemNote | Knowt | Rember | Brainscape | Mochi | StudyFetch | Gizmo | **LearnForge** |
|---------|------|---------|---------|-------|--------|------------|-------|------------|-------|----------------|
| **FSRS** | Plugin | No | FSRS-4.5 | No | FSRS-5 | No (CBR) | Beta | No | No | **Native** |
| **AI Card Generation** | Plugins | Yes | Yes | Yes | Via Claude | Yes | Limited | Yes | Yes | **Yes (MCP)** |
| **AI Tutor** | No | Killed | Yes | Paid | Via Claude | Per-card | No | Yes | Yes | **Yes (MCP+Claude)** |
| **MCP Integration** | 3rd party | No | No | No | 1 tool | No | 3rd party | No | No | **18+ tools** |
| **Bloom Tracking** | No | No | No | No | No | No | No | No | No | **Yes (6 levels)** |
| **Modality-Adjusted Intervals** | No | No | No | No | No | No | No | No | No | **Yes** |
| **Self-Hosted** | Yes | No | No | No | No | No | No | No | No | **Yes (Docker)** |
| **Open Source** | AGPL | No | No | No | MCP only | No | No | No | No | **AGPL-3.0** |
| **Mobile App** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Responsive Web + Claude Mobile (MCP) |
| **Content Marketplace** | Yes | Yes | No | No | No | Yes | No | No | No | No |
| **Gamification** | No | Yes | No | Yes | No | No | No | Yes | Yes | No |
| **Price** | Free* | $2.99-7.99/mo | $8-18/mo | Free-$9.99/mo | Freemium | $19.99/mo | $5/mo | $7.99-11.99/mo | $0.99-1.99/mo | **Free (self-hosted)** |

*Anki: Free on desktop/Android, $24.99 on iOS

---

## LearnForge Unique Differentiators

These five capabilities have **no equivalent in any competing product**:

### 1. Modality-Adjusted FSRS Intervals

LearnForge adjusts FSRS scheduling intervals based on how a card was studied:

| Modality | Multiplier | Rationale |
|----------|-----------|-----------|
| Chat (open recall with AI) | 1.2x | Hardest retrieval — produces strongest memory trace |
| Web (standard review) | 0.95x | Baseline interval |
| MCQ (multiple choice) | 1.05x | Structured retrieval — recognition with discrimination |

This is grounded in decades of testing effect research but has never been operationalized in any SRS product. **No competitor offers this.**

### 2. Per-Card Bloom's Taxonomy Tracking

Every card in LearnForge has a `bloom_state` tracking its cognitive level across Bloom's six stages (Remember, Understand, Apply, Analyze, Evaluate, Create). This enables:

- Progression from factual recall to higher-order thinking
- Study recommendations that advance cognitive depth, not just retention
- Visibility into whether a learner truly understands material or just memorizes it

**No competitor tracks Bloom's levels computationally.**

### 3. Native MCP with 18+ Tools

LearnForge's MCP server provides the deepest AI integration of any SRS:

- Full CRUD for cards, topics, and reviews
- Study session management (due cards, summaries)
- Semantic context retrieval (similar cards, topic trees)
- Image management
- Tutor instructions and card templates

For comparison: Rember offers 1 MCP tool. Anki MCP bridges offer 7-22 tools but require a running Anki Desktop instance.

### 4. Self-Hosted with Full Data Sovereignty

LearnForge runs entirely in Docker on the user's own infrastructure. No data leaves the user's control. Combined with the AGPL-3.0 license, this addresses growing concerns about:

- Student data privacy regulations (FERPA, GDPR)
- AI training on user content
- Vendor lock-in and platform shutdowns

Only Anki offers comparable self-hosting, but without native AI or MCP integration.

### 5. Open Architecture (REST API + MCP)

LearnForge is designed to work with **any LLM**, not locked to a specific AI provider:

- REST API for programmatic access
- MCP server for LLM integration (works with Claude, and any future MCP-compatible model)
- stdio and HTTP transport modes for flexible deployment

---

## Gaps and Opportunities

### Critical Gaps

| Gap | Impact | Competitors With This |
|-----|--------|-----------------------|
| **No content marketplace / shared decks** | Users must create all content themselves or via AI | Anki (shared decks), Quizlet (700M+ sets), Brainscape |
| **No shared decks** | Cannot leverage community-created content | Anki, Quizlet, AlgoApp (80M+ cards) |

### Mobile Strategy (Addressed)

LearnForge's mobile story is stronger than a simple "no mobile app" suggests:

1. **Responsive Web UI** — The web interface is mobile-optimized with bottom tab navigation, touch-friendly study cards, and responsive layouts. Users can study on any mobile browser today.
2. **Claude Mobile App (MCP)** — The primary AI-tutored study experience happens through Claude, which has native iOS and Android apps. MCP-based study sessions (the deepest learning modality) are already fully mobile.
3. **PWA-ready architecture** — Adding a service worker, app manifest, and offline card caching would convert the web app into an installable PWA with home-screen access and push notifications. This is a small engineering effort (days, not months).

The remaining gap is **offline study in the web UI** — users need connectivity to study via the browser. A PWA with offline caching would close this gap without native app development.

### Moderate Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| **No gamification** | Reduces engagement for casual/younger users | Duolingo, Kahoot, Knowt have strong gamification |
| **No offline mode** | Requires network connectivity | Mochi, Anki work fully offline |
| **No note-taking integration** | Users must use separate tools for notes | RemNote's core strength is notes + flashcards |

### Minor Gaps

| Gap | Notes |
|-----|-------|
| No FSRS optimizer | Anki's FSRS4Anki includes parameter optimization from user review data |
| No browser extension | Could enable web-clipping to card creation |
| No LMS integration | Enterprise/education market opportunity (LTI, SCORM) |

---

## Closest Competitor Deep Dive: Rember

Rember is the only product that combines FSRS and MCP integration, making it LearnForge's closest competitor.

### Rember Profile

| | |
|---|---|
| **URL** | [rember.com](https://www.rember.com) |
| **Algorithm** | FSRS-5 |
| **MCP** | Yes — open-source server ([github.com/rember/rember-mcp](https://github.com/rember/rember-mcp)) |
| **Pricing** | Freemium |
| **Open Source** | MCP server only (app is proprietary) |

### LearnForge vs. Rember

| Dimension | Rember | LearnForge |
|-----------|--------|------------|
| **FSRS version** | FSRS-5 | FSRS (ts-fsrs) |
| **MCP tools** | 1 (`create_flashcards`) | 18+ (full CRUD, study, context, images) |
| **Bloom's Taxonomy** | No | Yes (6-level per-card tracking) |
| **Modality adjustment** | No | Yes (chat 1.2x, web 0.95x, MCQ 1.05x) |
| **Self-hostable** | No | Yes (Docker Compose) |
| **Open source** | MCP server only | Full stack (AGPL-3.0) |
| **AI tutor depth** | Card creation via Claude | Full study workflow via Claude |
| **Mobile app** | Yes | Responsive web + Claude mobile (MCP); PWA-ready |
| **Data sovereignty** | Cloud only | Full user control |

### Key Takeaway

Rember validates the FSRS + MCP thesis but executes it narrowly. Their MCP integration is a single tool for card creation — it cannot retrieve study cards, submit reviews, navigate topic hierarchies, or perform any of the 17+ other operations LearnForge supports. LearnForge offers a fundamentally deeper integration that enables Claude to serve as a full AI tutor, not just a card generator.

---

## Market Trends (2024-2026)

### 1. AI Card Generation Is Table Stakes
Every major platform now offers AI-powered card generation. This is no longer a differentiator. The frontier has moved to AI tutoring quality and adaptive learning.

### 2. Chatbot Tutors: Evolving or Dying
Quizlet killed Q-Chat in June 2025. Duolingo doubled down with Roleplay and Video Call features. The market is bifurcating: either deep AI investment or retreat to core features.

### 3. Free Tiers Are Shrinking
Most platforms are tightening free tiers to push subscriptions. Knowt is counter-positioning as the "free alternative to Quizlet." LearnForge's self-hosted model sidesteps this dynamic entirely.

### 4. SRS Quality Varies Wildly
Most platforms use proprietary black-box algorithms. FSRS adoption is growing but still limited to a handful of products (Anki via plugin, RemNote, Rember, AlgoApp, LearnForge).

### 5. Multi-Modal Input Competition
PDF, video, handwriting, and URL import are active battlegrounds. StudyFetch and Kahoot lead in input diversity.

### 6. Personalization Is the Frontier
Beyond simple SRS, the next wave is truly adaptive learning that adjusts to individual cognitive patterns — exactly where LearnForge's Bloom tracking and modality adjustment provide an edge.

### 7. Language Learning Dominates AI Investment
Duolingo (135M MAU) and Memrise (72M registered) capture the most AI investment in the learning space, but their focus is narrowly on language acquisition.

### 8. Flashcard App Market Continues Growing
Overall market growth is driven by student adoption of digital study tools and AI-powered content creation lowering the barrier to entry.

---

## Recommended Positioning

> **LearnForge is the first AI-native spaced repetition system that combines modern FSRS scheduling with cognitive-level tracking (Bloom's Taxonomy) and modality-aware interval adjustment — all accessible through the Model Context Protocol for deep LLM integration.**

### Key Value Propositions (Ranked)

1. **Modality-adjusted FSRS intervals** — The only SRS that adjusts scheduling based on how you studied. Grounded in testing effect research, implemented nowhere else.
2. **Per-card Bloom's Taxonomy tracking** — The only SRS that tracks cognitive depth. Know whether you truly understand or just memorize.
3. **Native MCP with 18+ tools** — The deepest AI integration in any SRS. Claude (or any MCP-compatible LLM) becomes a full AI tutor, not just a card generator.
4. **Self-hosted with full data control** — Your learning data never leaves your infrastructure. AGPL-3.0 licensed.
5. **Open architecture** — REST API + MCP means LearnForge works with any LLM and integrates into any workflow.

### Biggest Risks

1. **No content marketplace** — New users face a cold-start problem without pre-made decks. APKG import would allow users to bring existing Anki decks.
2. **Anki ecosystem inertia** — Anki's established user base and plugin ecosystem create strong switching costs.
3. **No offline study** — The web UI requires connectivity. A PWA with offline caching would address this; Claude mobile already works for MCP-based study.

---

## Sources

- [Anki](https://apps.ankiweb.net)
- [Quizlet](https://quizlet.com)
- [RemNote](https://www.remnote.com)
- [Knowt](https://knowt.com)
- [Gizmo](https://gizmo.ai)
- [StudyFetch](https://www.studyfetch.com)
- [Scholarly.so](https://scholarly.so)
- [Mochi](https://mochi.cards)
- [Rember](https://www.rember.com)
- [Rember MCP Server](https://github.com/rember/rember-mcp)
- [Brainscape](https://www.brainscape.com)
- [SuperMemo](https://www.supermemo.com)
- [Duolingo](https://www.duolingo.com)
- [Memrise](https://www.memrise.com)
- [Kahoot](https://kahoot.com)
- [Chegg](https://www.chegg.com)
- [Vaia (StudySmarter)](https://www.vaia.com)
- [Cram](https://www.cram.com)
- [Orbit](https://withorbit.com)
- [AlgoApp / AnkiApp](https://anki-decks.com)
- [Noji](https://noji.io)
- [Awesome FSRS](https://github.com/open-spaced-repetition/awesome-fsrs)
- [Anki MCP Server](https://github.com/ankimcp/anki-mcp-server)
- [Mochi MCP Server](https://github.com/fredrikalindh/mcp-mochi)
