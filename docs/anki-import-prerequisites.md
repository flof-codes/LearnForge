# Anki (.apkg) Import: Prerequisite Feature Analysis

*April 2026 -- Product Manager analysis for CEO*

**Prior art:** This builds on [anki-feature-gap-analysis.md](anki-feature-gap-analysis.md) and [apkg-import-schema-analysis.md](apkg-import-schema-analysis.md) (March 2026), updated to reflect the current cloze sprint (FEAT-034 through FEAT-037).

---

## Executive Summary

Anki import is the #1 switching barrier for prospective users (scored 9.0/10 in our gap analysis). This document identifies what LearnForge must have **before** building the actual import feature, ranked by import-blocking priority.

**Good news:** The current cloze sprint closes the single biggest prerequisite gap. After FEAT-034-037 ship, the remaining blockers are moderate-effort work that can be sequenced into 2-3 focused sprints.

**Bottom line:** We need **5 prerequisite features** before import makes sense. Of those, 1 is already in progress (cloze), 2 are small schema additions, and 2 are new service modules. Total estimated prereq effort: 3-4 weeks after cloze ships.

---

## 1. What's Inside an .apkg File

An `.apkg` file is a ZIP archive containing:

| File | Content |
|------|---------|
| `collection.anki2` / `.anki21b` | SQLite database with all cards, notes, scheduling, deck/model definitions |
| `media` | JSON mapping numbered files to original filenames |
| `0`, `1`, `2`, ... | Media files (images, audio) renamed to sequential numbers |

### Key Anki Concepts vs LearnForge

| Anki Concept | LearnForge Equivalent | Gap |
|---|---|---|
| **Deck** (hierarchy via `::` separator) | **Topic** (hierarchy via `parent_id`) | None -- clean mapping |
| **Note** (content container with fields) | No equivalent | Flatten at import (by design) |
| **Note Type / Model** (field definitions + card templates) | No equivalent | Render templates at import time |
| **Card** (reviewable item generated from note + template) | **Card** (with `front_html` / `back_html`) | Need template rendering at import |
| **Cloze deletion** (`{{c1::answer::hint}}`) | **Cloze card** (`card_type: 'cloze'`, `cloze_data` JSON) | Closing now (FEAT-034-037) |
| **Basic + Reversed** (one note, two cards) | No equivalent | Create 2 separate cards at import |
| **SM-2 scheduling** (ease factor, interval, due day) | **FSRS** (stability, difficulty, due timestamp) | Need conversion logic |
| **Review history** (`revlog` table) | **Reviews** table | Need mapping (mostly 1:1) |
| **Media** (images + audio in ZIP) | **Images** table + disk storage | Need audio support |
| **Suspended/buried cards** | No equivalent | Need `suspended` column |
| **Card flags** (color markers) | No equivalent | Nice-to-have |

---

## 2. Prerequisite Features (Prioritized)

### P0: BLOCKING -- Must exist before import can work at all

#### PREREQ-1: Cloze Card Support [IN PROGRESS]
**Status:** FEAT-034 through FEAT-037 (current sprint)
**Why blocking:** ~40-60% of Anki cards in popular shared decks (especially medical) are cloze deletions. Without cloze support, we'd have to either skip them (unacceptable) or flatten them to static HTML (loses the interactive review behavior).
**What it delivers:**
- `card_type` column on cards table (values: `standard`, `cloze`)
- `cloze_data` JSONB column storing structured deletion data
- Backend HTML renderer for cloze front/back
- `parseClozeText()` function that accepts Anki-compatible `{{c1::answer::hint}}` syntax
- MCP tutor instructions for cloze Bloom progression

**Import impact:** The cloze parser from FEAT-035 can directly parse Anki cloze syntax from the note's `flds` field. Each cloze deletion (c1, c2, c3) in Anki generates a separate card; our import can create separate LearnForge cloze cards each focused on one active deletion.

**Remaining gap after sprint:** None for basic cloze. Multi-cloze notes (c1 + c2 on same note) generate multiple Anki cards -- our import must create multiple LearnForge cards from one note, each with the same `cloze_data` but a different `activeIndex` for rendering. This is a design detail for the import implementation itself, not a prerequisite.

---

#### PREREQ-2: Anki Template Renderer (New Service)
**Status:** Not started
**Effort:** M (3-5 days)
**Why blocking:** Anki cards are not stored as HTML. They're generated dynamically from note fields + templates. To import, we must render the final HTML at import time.

**What's needed:**
A `core/src/lib/anki-template-renderer.ts` module that:
1. Takes a note's fields (split by `\x1f` separator) and a model's template (`qfmt` / `afmt`)
2. Substitutes `{{FieldName}}` placeholders with actual field values
3. Handles special placeholders: `{{FrontSide}}`, `{{Tags}}`, `{{Deck}}`, `{{type:FieldName}}`
4. Handles conditional sections: `{{#FieldName}}...{{/FieldName}}` (show block if field non-empty), `{{^FieldName}}...{{/FieldName}}` (show if empty)
5. For cloze models: uses our existing `renderClozeHtml()` from FEAT-035 instead of template rendering
6. Wraps output in Pico CSS classless HTML structure + the model's custom CSS

**Complexity notes:**
- The core substitution is regex-based and straightforward
- Conditional sections add moderate complexity but are well-documented
- Custom JavaScript in Anki templates will NOT execute in LearnForge (acceptable -- affects <1% of cards)
- The model's CSS should be scoped (wrapped in a container class) to avoid conflicts with LearnForge's own styles

---

#### PREREQ-3: SM-2 to FSRS Scheduling Converter (New Service)
**Status:** Not started
**Effort:** S-M (2-3 days)
**Why blocking:** Without converting scheduling state, imported cards would either lose all scheduling (users must re-learn everything -- unacceptable) or be scheduled incorrectly.

**What's needed:**
A `core/src/lib/anki-scheduling-converter.ts` module that handles three scenarios:

| Scenario | Detection | Conversion |
|---|---|---|
| **Anki uses FSRS** (Anki 23.10+) | `cards.data` contains `s` and `d` fields; deck config has `fsrsWeights` | Direct copy: `stability = s`, `difficulty = d` |
| **SM-2 with review history** | `revlog` has entries for this card | Replay revlog through `ts-fsrs` to compute proper stability/difficulty |
| **SM-2 without history** | Card has `ivl` and `factor` but no/sparse revlog | Heuristic: `stability ~= ivl`, `difficulty ~= clamp(11 - factor/1000 * 3.7, 1, 10)` |

**Due date conversion:**
- Anki review cards store `due` as a day-number relative to collection creation date
- Convert: `due_timestamp = collection_created_at + (due * 86400 * 1000)`
- Anki learning cards store `due` as epoch seconds -- convert directly
- Anki new cards store `due` as position integer -- import as FSRS state 0 (new), due = now

**State mapping:**
| Anki `cards.type` | FSRS `state` |
|---|---|
| 0 (new) | 0 (New) |
| 1 (learning) | 1 (Learning) |
| 2 (review) | 2 (Review) |
| 3 (relearning) | 3 (Relearning) |

**Bloom state for imports:** All imported cards start at Bloom level 0 (Remember). The AI tutor will naturally progress them through Bloom levels during study. This is correct because Bloom measures cognitive engagement depth, which hasn't been tested yet by LearnForge.

---

### P1: HIGH PRIORITY -- Severely degrades import quality without these

#### PREREQ-4: Audio File Support
**Status:** Not started
**Effort:** M (5-7 days for full support)
**Why high priority:** Language learning decks heavily use audio. Anki's `[sound:filename.mp3]` syntax appears in ~30% of shared decks. Without audio support, these cards import with broken references or raw `[sound:]` text.

**What's needed:**
1. **Schema:** Expand `images` table to general `media` table, or add audio MIME types to the allowed list (currently only `image/*`)
2. **Storage:** Accept MP3, WAV, OGG, M4A files alongside images
3. **Conversion at import:** Transform `[sound:file.mp3]` to `<audio src="/media/{uuid}" controls></audio>` in card HTML
4. **API:** Audio upload endpoint (or extend existing image upload)
5. **Web UI:** `<audio>` playback in study view (browsers handle this natively -- minimal UI work)

**What we can defer:**
- Recording from microphone (not needed for import)
- TTS integration (separate feature)
- Audio autoplay settings (can use browser defaults)

**Alternative (MVP):** Import audio files and embed them as `<audio>` tags, but don't add a general audio upload UI. Users can add audio via import or MCP but not the web editor. This reduces effort to S-M.

---

#### PREREQ-5: Card `suspended` Column
**Status:** Not started
**Effort:** S (1 day -- migration + service update + API filter)
**Why high priority:** Anki users commonly suspend cards (manually or via leech threshold). A typical collection has 5-20% suspended cards. Without this column, suspended cards would either be imported as active (messing up study queues) or skipped (losing data).

**What's needed:**
```sql
ALTER TABLE cards ADD COLUMN suspended boolean NOT NULL DEFAULT false;
```

Plus:
- Filter suspended cards from study queries (`WHERE NOT c.suspended`)
- Add suspend/unsuspend API endpoints
- Add suspend toggle in card detail UI
- MCP tool to suspend/unsuspend cards

**Import mapping:**
| Anki `cards.queue` | LearnForge |
|---|---|
| -1 (suspended) | `suspended = true` |
| -2 (user buried) | `suspended = false` (bury is session-temporary) |
| -3 (scheduler buried) | `suspended = false` |
| >= 0 | `suspended = false` |

---

### P2: NICE-TO-HAVE -- Improves import fidelity but not blocking

#### PREREQ-6: Import Source Tracking (`source` column)
**Effort:** S (1 day)
**Why useful:** Enables duplicate detection on re-import, provenance tracking, and analytics.

```sql
ALTER TABLE cards ADD COLUMN source jsonb;
-- {"type": "anki_import", "ankiNoteId": 1234567890, "ankiCardOrd": 0, "ankiModel": "Basic", "importedAt": "..."}
```

Without this, re-importing the same deck creates duplicates. With it, we can offer "skip existing / update existing / create duplicate" options.

#### PREREQ-7: Basic + Reversed Card Type
**Effort:** S (1-2 days)
**Why useful:** Common Anki card type. Currently we'd import these as two independent standard cards, which works but loses the conceptual link. Adding a `basic_reversed` card type with a `reverseHtml` field would be cleaner.

**Alternative:** Just create two separate cards at import. No schema change needed. The user experience is acceptable -- they're just two cards in the same topic. **Recommendation: do this.** Don't add a new card type just for import fidelity.

#### PREREQ-8: Card Flags
**Effort:** S (half day)
**Why useful:** Preserves Anki flag colors. Could map to tags instead (`flag:red`, `flag:blue`).

**Recommendation:** Map to tags at import time. Don't add a `flags` column. Tags are more flexible and already supported.

#### PREREQ-9: Review Duration Tracking
**Effort:** S (half day -- add column, populate during import)
**Why useful:** Anki's `revlog.time` tracks review duration in ms. Enables "time spent studying" analytics.

```sql
ALTER TABLE reviews ADD COLUMN duration_ms integer;
```

**Recommendation:** Add the column but don't require it. Populate from Anki revlog during import. Start tracking for new reviews later as a separate feature.

---

## 3. What We Explicitly Do NOT Need

| Anki Feature | Why Skip |
|---|---|
| **Note type / template system** | LearnForge's per-card HTML model is fundamentally better for AI generation. Render templates at import time and store final HTML. Do not replicate Anki's template architecture. |
| **Deck configuration (daily limits, steps, fuzz)** | Global FSRS defaults work well. Per-topic study options can be added later independently of import. |
| **Filtered / dynamic decks** | These are temporary in Anki. Skip during import -- the cards belong to their original decks. |
| **Update sequence numbers (USN)** | Anki sync protocol concept. LearnForge is server-authoritative. |
| **Card GUID** | For Anki peer-to-peer sync. We use UUIDs. The `source.ankiNoteId` serves duplicate detection. |
| **Ease factor storage** | FSRS doesn't use ease factors. Convert at import time, then let FSRS manage scheduling natively. |
| **Image occlusion** | Can be imported as static images. Full IO support is a separate feature (scored 7.3 in gap analysis). |

---

## 4. Dependency Graph

```
PREREQ-1 (Cloze) -----> [IN PROGRESS, blocks import of ~50% of cards]
    |
    v
PREREQ-2 (Template Renderer) --> [blocks import of ALL cards]
    |
PREREQ-3 (SM-2→FSRS Converter) --> [blocks scheduling preservation]
    |
    v
IMPORT FEATURE (APKG parser, media extraction, deck→topic mapping,
                card creation pipeline, duplicate detection, UI)
    |
    +-- PREREQ-4 (Audio) --> [blocks language decks, ~30% of shared decks]
    +-- PREREQ-5 (Suspended) --> [blocks proper state preservation]
    +-- PREREQ-6 (Source tracking) --> [enables re-import / dedup]
```

**Critical path:** PREREQ-1 (in progress) -> PREREQ-2 + PREREQ-3 (can parallelize) -> Import feature itself

PREREQ-4 and PREREQ-5 can be built in parallel with the import feature or immediately before.

---

## 5. Recommended Sequencing

### Sprint N (current): Cloze Cards
- FEAT-034 through FEAT-037 + TASK-037
- Delivers PREREQ-1

### Sprint N+1: Import Prerequisites (3-4 weeks)
| Ticket | Effort | Parallelizable |
|---|---|---|
| PREREQ-5: `suspended` column + API/UI | S (1-2 days) | Yes |
| PREREQ-6: `source` column | S (1 day) | Yes |
| PREREQ-4: Audio file support (MVP) | S-M (3-4 days) | Yes |
| PREREQ-2: Anki template renderer | M (3-5 days) | After cloze ships |
| PREREQ-3: SM-2 to FSRS converter | S-M (2-3 days) | Yes |

### Sprint N+2: Import Feature (3-4 weeks)
| Component | Effort |
|---|---|
| APKG parser (ZIP + SQLite + media extraction) | M (3-5 days) |
| Import pipeline (cards, topics, reviews, media) | M (5-7 days) |
| Duplicate detection | S (1-2 days) |
| Import API endpoint (upload + async processing) | S (1-2 days) |
| Import UI (upload, progress, summary, conflict resolution) | M (3-5 days) |
| i18n (EN + DE) | S (1 day) |
| Integration tests | M (3-5 days) |

### Total: ~6-8 weeks after cloze sprint ships

---

## 6. i18n Considerations

The import feature will need these translation key groups (EN + DE):

| Key Group | Example Keys |
|---|---|
| Import UI | `import.title`, `import.uploadFile`, `import.processing`, `import.complete` |
| Import summary | `import.cardsImported`, `import.topicsCreated`, `import.mediaFiles`, `import.reviewsImported` |
| Conflict resolution | `import.duplicateFound`, `import.skipExisting`, `import.updateExisting`, `import.createDuplicate` |
| Errors | `import.invalidFile`, `import.unsupportedFormat`, `import.tooLarge` |
| Card type labels | `cardTypes.standard`, `cardTypes.cloze` (needed for cloze sprint too) |
| Suspended state | `cardDetail.suspended`, `cardDetail.unsuspend`, `cards.filterSuspended` |
| Audio | `cardEditor.audioUpload` (if we add audio upload UI) |

I will prepare exact EN + DE translations when the import tickets are being written.

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Anki schema v18 (protobuf)** uses different format than v11 (JSON) | Medium | High -- newer exports may not parse | Support both formats; detect version from file presence (`anki21b` = v18) |
| **Custom JavaScript in Anki templates** breaks in LearnForge | Low | Medium -- affects <1% of cards | Document limitation; strip `<script>` tags during import |
| **Large decks (50K+ cards)** timeout or OOM during import | Medium | High -- bad UX | Process in batches; use streaming ZIP extraction; async job with progress |
| **Audio files significantly increase storage** | Medium | Medium | Set per-user storage quotas; compress on upload |
| **SM-2 to FSRS conversion produces poor scheduling** | Low | Medium -- cards feel "wrong" | Offer "reset scheduling" option; FSRS self-corrects after a few reviews |
| **Multi-cloze notes create unexpected card count** | Low | Low | Show preview count before import; explain in UI |

---

## 8. Open Questions for CEO / Tech Lead

1. **Audio support scope:** Full audio upload UI + editor, or MVP (import-only, no manual audio upload)?
2. **Import size limit:** What's the max .apkg file size we should support? (Large medical decks can be 500MB+ with media)
3. **Re-import strategy:** Should we support updating existing cards from a newer version of the same deck, or just duplicate detection?
4. **Scheduling preference:** Should we offer "import as new cards" (reset scheduling) as an option alongside scheduling conversion?
5. **Web UI for import:** Full page with drag-and-drop, progress bar, and conflict resolution? Or simple upload + automatic processing?
