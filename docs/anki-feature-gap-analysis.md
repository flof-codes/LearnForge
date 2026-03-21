# LearnForge vs Anki: Feature Gap Analysis & Priority Ranking

*Generated March 2026 — Multi-perspective team analysis*

---

## Executive Summary

This analysis examines every significant feature gap between LearnForge and Anki, scored from three perspectives: **Students** (the largest user segment), **Power Users** (the most vocal and influential), and **Market/ROI** (user acquisition potential vs. engineering effort). Each feature receives an **Overall Importance Score (0-10)** reflecting its priority for acquiring Anki users.

**Key Finding:** The top 3 priorities — Mobile/PWA, Anki Import, and Cloze Deletions — are table-stakes features without which most Anki users won't even trial LearnForge. Our unique differentiators (AI tutoring, Bloom tracking, modality adjustment) are powerful retention hooks, but they can't compensate for missing fundamentals.

---

## Scoring Methodology

Each feature is rated on four dimensions:

| Dimension | Description | Weight |
|-----------|-------------|--------|
| **Student Score** (0-10) | How much students need this for daily study | 30% |
| **Power User Score** (0-10) | How much power users / long-term Anki users need this | 25% |
| **Market Score** (0-10) | User acquisition potential and strategic value | 25% |
| **Effort-Adjusted ROI** (0-10) | Impact relative to implementation effort | 20% |

**Overall Score** = weighted average, rounded to 1 decimal.

**Effort Legend:** S = days, M = 1-2 weeks, L = 3-6 weeks, XL = 2+ months

---

## Feature Priority Ranking

### Tier 1: Critical (Score 8.0+) — Must Have to Compete

| # | Feature | Status | Student | Power User | Market | ROI | **Overall** | Effort |
|---|---------|--------|---------|------------|--------|-----|-------------|--------|
| 1 | **Mobile App / PWA** | Missing | 10 | 7 | 10 | 7 | **8.7** | L-XL |
| 2 | **Anki Import (APKG)** | Missing | 9 | 10 | 9 | 8 | **9.0** | M-L |
| 3 | **Cloze Deletion Cards** | Missing | 9 | 9 | 8 | 9 | **8.8** | M |
| 4 | **Shared Decks / Content Library** | Missing | 9 | 5 | 10 | 5 | **7.5** | XL |
| 5 | **Audio Support** | Missing | 9 | 7 | 8 | 8 | **8.1** | M |
| 6 | **Cross-Device Sync** | Missing | 9 | 8 | 8 | 5 | **7.6** | L-XL |

### Tier 2: Important (Score 6.0-7.9) — Needed for Retention

| # | Feature | Status | Student | Power User | Market | ROI | **Overall** | Effort |
|---|---------|--------|---------|------------|--------|-----|-------------|--------|
| 7 | **Image Occlusion** | Missing | 8 | 6 | 7 | 8 | **7.3** | M |
| 8 | **Keyboard Shortcuts (Review)** | **Present** | — | — | — | — | **Already done** | — |
| 9 | **Advanced Search / Browser** | Partial | 5 | 10 | 5 | 7 | **6.6** | M |
| 10 | **Filtered / Custom Study** | Missing | 7 | 8 | 6 | 7 | **7.0** | M |
| 11 | **Comprehensive Statistics** | Partial | 7 | 8 | 6 | 7 | **7.0** | M |
| 12 | **Offline Mode** | Missing | 7 | 6 | 6 | 4 | **5.9** | L |
| 13 | **Multi-level Undo** | Missing | 5 | 8 | 4 | 9 | **6.3** | S-M |
| 14 | **Custom Note Types / Fields** | Missing | 5 | 10 | 5 | 5 | **6.2** | L |
| 15 | **Bulk Operations** | Missing | 5 | 9 | 4 | 7 | **6.1** | M |
| 16 | **Tags System** | Missing | 6 | 8 | 5 | 8 | **6.7** | M |
| 17 | **CSV Import/Export** | Partial | 6 | 7 | 6 | 9 | **6.9** | S-M |

### Tier 3: Valuable (Score 4.0-5.9) — Nice to Have

| # | Feature | Status | Student | Power User | Market | ROI | **Overall** | Effort |
|---|---------|--------|---------|------------|--------|-----|-------------|--------|
| 18 | **Card Suspend / Bury** | Missing | 5 | 7 | 3 | 9 | **5.8** | S |
| 19 | **Card Flagging / Marking** | Missing | 5 | 6 | 3 | 9 | **5.5** | S |
| 20 | **Edit During Review** | Missing | 5 | 7 | 3 | 8 | **5.6** | S |
| 21 | **Deck Options / Presets** | Missing | 4 | 8 | 4 | 6 | **5.4** | M |
| 22 | **Video Support** | Missing | 5 | 4 | 5 | 5 | **4.8** | M |
| 23 | **TTS (Text-to-Speech)** | Missing | 6 | 4 | 5 | 6 | **5.3** | M |
| 24 | **Type-in-the-Answer Cards** | Missing | 5 | 5 | 4 | 7 | **5.2** | S-M |
| 25 | **Basic + Reversed Cards** | Missing | 5 | 5 | 3 | 9 | **5.3** | S |
| 26 | **Review Heatmap / Calendar** | Missing | 6 | 6 | 5 | 7 | **6.0** | S-M |
| 27 | **Gamification / Streaks** | Missing | 6 | 2 | 6 | 7 | **5.3** | M |
| 28 | **Plugin / Add-on System** | Missing | 3 | 10 | 6 | 2 | **5.0** | XL |
| 29 | **FSRS Parameter Optimizer** | Missing | 3 | 8 | 4 | 5 | **4.8** | L |
| 30 | **Custom Scheduling (JS hooks)** | Missing | 2 | 8 | 3 | 4 | **4.0** | L |

### Tier 4: Low Priority (Score < 4.0)

| # | Feature | Status | Student | Power User | Market | ROI | **Overall** | Effort |
|---|---------|--------|---------|------------|--------|-----|-------------|--------|
| 31 | **Browser Extension** | Missing | 3 | 4 | 3 | 5 | **3.7** | M |
| 32 | **LMS Integration (LTI/SCORM)** | Missing | 2 | 2 | 5 | 3 | **3.0** | L |
| 33 | **Debug Console** | Missing | 1 | 6 | 1 | 4 | **2.8** | M |
| 34 | **AnkiHub Integration** | Missing | 4 | 3 | 3 | 2 | **3.1** | XL |

---

## Detailed Analysis by Feature

### 1. Mobile App / PWA (Overall: 8.7)

**Why it matters:** Mobile is the #1 study context. Students study on buses, in waiting rooms, between classes. Without mobile access, LearnForge is limited to desk-bound study, eliminating the most common SRS use case.

**Current state:** LearnForge has a responsive web UI but no PWA manifest, no service worker, no offline caching.

**Recommendation:** Start with a **Progressive Web App (PWA)** rather than native apps. Add service worker, app manifest, and offline card caching. This gets 80% of the value at 20% of the effort of native apps. Native apps can follow if the PWA proves the market.

**Implementation path:** PWA with offline review queue → Capacitor wrapper for app stores → Native apps (long-term)

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 10 | Absolute necessity — 70%+ of study happens on mobile |
| Power User | 7 | Important but power users more often use desktop |
| Market | 10 | No mobile = invisible to the largest user segment |
| ROI | 7 | High effort (L-XL) but equally high impact |

---

### 2. Anki Import (APKG) (Overall: 9.0)

**Why it matters:** This is THE #1 switching barrier. Users with thousands of cards and years of review history will never switch if they can't bring their data. APKG import removes the biggest objection and enables a zero-risk trial.

**Current state:** No import functionality. Users must recreate everything from scratch or use MCP/API.

**Recommendation:** Implement APKG file import with field mapping. Must preserve: cards, note types (map to LearnForge format), media files, review history (convert SM-2/FSRS state), tags (map to topics), deck hierarchy (map to topic tree).

**Technical notes:** APKG is a ZIP of SQLite DB + media files. Well-documented format. Libraries exist for parsing.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 9 | Years of cards are irreplaceable; import is mandatory for switching |
| Power User | 10 | Absolute deal-breaker — will not switch without full data migration |
| Market | 9 | Removes the single biggest barrier to user acquisition |
| ROI | 8 | Medium effort, but unlocks the entire Anki migration funnel |

---

### 3. Cloze Deletion Cards (Overall: 8.8)

**Why it matters:** Cloze deletions are the single most popular card type among serious Anki users. Medical students use them almost exclusively (AnKing deck is primarily cloze). Without cloze support, LearnForge can't serve the highest-value SRS segment.

**Current state:** Only concept-based HTML cards. No cloze syntax, no cloze UI, no cloze rendering.

**Recommendation:** Implement cloze with `{{c1::answer}}` syntax (Anki-compatible). Support multiple clozes per card (each becomes a separate review item). Add cloze creation shortcuts in the editor.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 9 | Medical students: 10/10. Language learners: 8/10. CS students: 6/10 |
| Power User | 9 | Fundamental card type — not having it is a non-starter |
| Market | 8 | Blocks the entire medical student segment without this |
| ROI | 9 | Medium effort, massive unlock for the highest-value user segment |

---

### 4. Shared Decks / Content Library (Overall: 7.5)

**Why it matters:** Shared decks create powerful network effects and solve the cold-start problem. New users can start studying immediately with community content instead of creating everything from scratch. Anki's shared deck library is one of its strongest moats.

**Current state:** No sharing functionality. Each user's content is isolated.

**Recommendation:** Build a deck sharing system in phases: (1) Export/import shareable deck files, (2) Public deck listing on the web, (3) In-app discovery and one-click install. Consider starting with curated "starter packs" rather than a full marketplace.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 9 | Huge for medical (AnKing), language (shared sentence decks), exam prep |
| Power User | 5 | Power users mostly create their own cards |
| Market | 10 | Network effects are the strongest competitive moat possible |
| ROI | 5 | XL effort, but strategically critical long-term |

---

### 5. Audio Support (Overall: 8.1)

**Why it matters:** Essential for language learners (pronunciation, listening comprehension) and used across many other domains. Anki's audio support includes recording, playback, and TTS.

**Current state:** No audio upload, playback, or recording.

**Recommendation:** Add audio file upload (MP3/WAV/OGG), embed in cards with `<audio>` player, add record-from-microphone in card editor.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 9 | Critical for language learners; useful for music, medicine (heart sounds) |
| Power User | 7 | Important for completeness |
| Market | 8 | Blocks the entire language learning segment without this |
| ROI | 8 | Medium effort — HTML5 audio is well-supported |

---

### 6. Cross-Device Sync (Overall: 7.6)

**Why it matters:** Users study on multiple devices (phone on commute, laptop at desk). Without sync, they're locked to a single device.

**Current state:** Single server instance. Multiple devices can access via web browser, but there's no offline sync.

**Recommendation:** Since LearnForge is already web-based with a central server, multi-device access already works (just open the URL). The real gap is offline sync — the ability to study when disconnected and sync back when online. This pairs with the PWA effort.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 9 | Multi-device is expected; offline sync is the real gap |
| Power User | 8 | Expects seamless cross-device experience |
| Market | 8 | Table stakes for modern apps |
| ROI | 5 | L-XL effort for proper offline sync with conflict resolution |

---

### 7. Image Occlusion (Overall: 7.3)

**Why it matters:** Image occlusion is the second most popular card type for medical students (after cloze). Users overlay rectangular masks on anatomy diagrams, charts, and maps to test spatial knowledge.

**Current state:** Not supported. Cards can embed images but not mask/occlude regions.

**Recommendation:** Implement an image occlusion editor (canvas-based mask drawing) and a review mode that reveals masked regions on flip.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 8 | Critical for medical students (anatomy), geography, sciences |
| Power User | 6 | Useful but not a deal-breaker for most |
| Market | 7 | Strong draw for medical student segment |
| ROI | 8 | Medium effort with canvas-based approach; high impact for med students |

---

### ~~8. Keyboard Shortcuts for Review~~ — ALREADY IMPLEMENTED

**Correction:** The codebase analysis revealed that LearnForge **already has keyboard shortcuts**: Space/G to flip cards, A/S/D/F (home row) + 1/2/3/4 for ratings. These are implemented in `RatingButtons.tsx` and `InteractiveCard.tsx`. This is no longer a gap.

---

### 9. Advanced Search / Card Browser (Overall: 6.6)

**Why it matters:** Anki's browser is one of its most powerful features. Users search by tag, deck, due date, interval, ease, card state, note content, and more. The browser is essential for managing large collections.

**Current state:** Basic card listing by topic. No search syntax, no filters, no sort options.

**Recommendation:** Build a search bar with Anki-compatible syntax subset: `tag:`, `topic:`, `is:due`, `is:new`, `is:suspended`, `rated:`, `added:`, text search. Add sort by due date, interval, ease, created date.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 5 | Students with few cards don't need it; large collections do |
| Power User | 10 | The browser IS Anki's card management — critical for large collections |
| Market | 5 | Not a marketing differentiator |
| ROI | 7 | Medium effort but enables all card management workflows |

---

### 10. Filtered / Custom Study Sessions (Overall: 7.0)

**Why it matters:** Before an exam, students want to study specific subsets: "all cards from Chapter 5 due in the next week" or "100 random cards from this topic." Anki's filtered decks and custom study options serve this use case.

**Current state:** Study flow is limited to due cards per topic. No way to create ad-hoc study sessions by criteria.

**Recommendation:** Add a "Custom Study" option: study by tag/topic, include new/review/both, limit count, sort order (random, oldest, lowest ease). Store as a temporary session, not a persistent deck.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 7 | Essential for exam prep — "cram these 200 cards before tomorrow" |
| Power User | 8 | Frequently used for targeted review and deck management |
| Market | 6 | Differentiator for exam prep use case |
| ROI | 7 | Medium effort, enables a critical study workflow |

---

### 11. Comprehensive Statistics (Overall: 7.0)

**Why it matters:** Students and power users track their progress obsessively. Anki offers 10+ graph types including review forecast, interval distribution, ease factor histogram, added/matured over time, and hourly breakdown.

**Current state:** Better than initially assumed. Dashboard has: card state bar chart (new/learning/relearning/young/mature), review + creation streaks, due forecast chart (30-day daily + 12-month), topic distribution pie chart, Bloom distribution bar chart, 7-day accuracy. Missing vs Anki: review heatmap/calendar, interval distribution, ease histogram, hourly breakdown, true retention calculation.

**Recommendation:** Phase 1: Add review history charts (daily reviews, answer distribution). Phase 2: Forecast graph, interval distribution, ease histogram. Phase 3: Review heatmap calendar.

| Perspective | Score | Reasoning |
|-------------|-------|-----------|
| Student | 7 | Motivational and informational — "am I on track?" |
| Power User | 8 | Needs granular data to optimize study habits |
| Market | 6 | Good for engagement and retention |
| ROI | 7 | Medium effort across phases; heatmap is quick win |

---

### 12-17: Summary of Remaining Tier 2 Features

| Feature | Key Insight | Quick Win? |
|---------|-------------|------------|
| **Offline Mode** (5.9) | Pairs with PWA effort. Service worker + IndexedDB cache | Part of PWA |
| **Multi-level Undo** (6.3) | Critical for review sessions — "oops, wrong button" | Yes (S-M) |
| **Custom Note Types** (6.2) | Power user need — field system for structured data | No (L) |
| **Bulk Operations** (6.1) | Select multiple → tag/move/delete. Essential for management | No (M) |
| **Tags System** (6.7) | Cross-cutting organization beyond topic hierarchy | Yes (M) |
| **CSV Import/Export** (6.9) | Easy onboarding path; Anki exports CSV too | Yes (S-M) |

---

## LearnForge's Competitive Advantages (What Anki Can't Match)

These are features where LearnForge is **ahead** of Anki and should be highlighted in marketing:

| Advantage | vs. Anki | Defensibility |
|-----------|----------|---------------|
| **AI Tutoring via MCP** | Anki has no native AI; plugins are fragile | High — deep integration is hard to replicate |
| **Bloom's Taxonomy Tracking** | No equivalent in Anki or any competitor | High — unique conceptual approach |
| **Modality-Adjusted Intervals** | Not available anywhere | High — novel algorithm feature |
| **Modern Web UI** | Anki's Qt UI is dated and clunky | Medium — UI can be copied |
| **Self-Hosted Multi-User** | Anki is single-user desktop app | Medium — different architecture |
| **Interactive HTML Cards** | Anki supports HTML but less interactively | Medium — capability parity |
| **Semantic Search (pgvector)** | Anki has text search only | High — requires vector infrastructure |
| **REST API** | AnkiConnect is a plugin, not native | Medium — API-first architecture |

---

## Recommended Implementation Roadmap

### Phase 1: "Migration Ready" (4-6 weeks)
*Goal: Remove switching barriers so Anki users can trial LearnForge*

1. **Cloze deletion cards** (M) — Unlock medical student segment
2. **Anki import (APKG)** (M-L) — Remove #1 switching barrier
3. **Audio support** (M) — Unlock language learner segment
4. **Basic+Reversed cards** (S) — Common card type, easy to add
5. **Card suspend/bury** (S) — Review workflow essential
6. **Multi-level undo** (S-M) — Review session safety net

### Phase 2: "Daily Driver" (6-8 weeks)
*Goal: Make LearnForge good enough for daily use to replace Anki*

7. **PWA with offline caching** (L) — Mobile study without native app
8. **Tags system** (M) — Cross-cutting organization
9. **CSV import/export** (S-M) — Easy data portability
10. **Comprehensive statistics** (M) — Graphs and heatmap
11. **Filtered/custom study sessions** (M) — Exam prep support
12. **Multi-level undo** (S-M) — Review session safety net

### Phase 3: "Better Than Anki" (8-12 weeks)
*Goal: Features that make LearnForge clearly superior for target segments*

13. **Image occlusion** (M) — Medical student essential
14. **Advanced search/browser** (M) — Power user card management
15. **Bulk operations** (M) — Large collection management
16. **Review heatmap / calendar** (S-M) — Engagement/motivation
17. **TTS integration** (M) — Language learner enhancement
18. **Shared deck system** (XL) — Network effects and cold-start solution

### Phase 4: "Ecosystem" (ongoing)
*Goal: Build moats through network effects and extensibility*

19. **Content marketplace / shared decks** — Community content
20. **Plugin/add-on system** — Developer ecosystem
21. **FSRS optimizer** — Personalized scheduling
22. **Native mobile apps** — Full mobile experience

---

## Strategic Insights

### Who to Target First

1. **"Anki-frustrated" students** — Users who find Anki's UI painful but have no better alternative. LearnForge's modern UI + AI tutoring is the pitch. Requires: import, cloze, mobile.

2. **AI-curious learners** — People who want AI-powered study but haven't committed to any SRS. LearnForge's MCP integration is unmatched. Requires: easy onboarding, shared decks.

3. **Privacy-conscious / self-hosters** — Small but vocal segment that values data sovereignty. LearnForge is already positioned here. Requires: better documentation, easy deploy.

4. **Medical students** — Highest-value segment but hardest to win (deeply embedded in AnkiHub/AnKing). Requires: cloze, image occlusion, import, shared decks.

### What NOT to Build (Yet)

- **Full add-on system** — XL effort, low near-term ROI. The REST API + MCP already enables extensibility.
- **Native mobile apps** — PWA first. Reassess after 6 months of usage data.
- **AnkiHub integration** — Politically complex and technically challenging. Build our own sharing system instead.
- **LMS integration** — Enterprise play that distracts from consumer adoption.
- **Custom scheduling** — FSRS is already best-in-class. Optimizer is better investment than custom hooks.

### The "10x" Opportunity

LearnForge's unique combination of **AI tutoring + Bloom tracking + modality adjustment** is genuinely novel. No other product offers adaptive AI that tracks cognitive depth and adjusts scheduling accordingly. This is the "10x better" story — but it only works once the basics (mobile, import, cloze) are in place. The strategy is:

> **Match Anki on fundamentals → Win on AI-native intelligence**

---

## Summary: Top 10 Features by Overall Score

| Rank | Feature | Overall Score | Effort | Key Unlock |
|------|---------|---------------|--------|------------|
| 1 | Anki Import (APKG) | **9.0** | M-L | Removes #1 switching barrier |
| 2 | Cloze Deletion Cards | **8.8** | M | Unlocks medical student segment |
| 3 | Mobile App / PWA | **8.7** | L-XL | Enables on-the-go study (70% of use) |
| 4 | Audio Support | **8.1** | M | Unlocks language learner segment |
| 5 | Cross-Device Sync | **7.6** | L-XL | Multi-device expectation |
| 6 | Shared Decks | **7.5** | XL | Network effects, cold-start solution |
| 7 | Image Occlusion | **7.3** | M | Medical student essential |
| 8 | Filtered / Custom Study | **7.0** | M | Exam prep workflow |
| 9 | Comprehensive Statistics | **7.0** | M | Review heatmap, interval distribution |
| 10 | CSV Import/Export | **6.9** | S-M | Easy onboarding, data portability |

**Note:** Keyboard shortcuts (originally ranked #7) were found to **already be implemented** (Space/G to flip, A/S/D/F + 1-4 for ratings). Statistics are also more complete than initially assumed (dashboard has streaks, forecasts, card state charts, Bloom distribution).

**Bottom line:** LearnForge has genuinely unique differentiators that no competitor can match. But without the fundamentals (import, cloze, mobile, audio), those differentiators remain invisible to the very users who would benefit most from them. The path to competing with Anki is: **match the basics, then win on intelligence.**
