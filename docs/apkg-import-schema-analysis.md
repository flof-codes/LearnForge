# APKG Import: Schema Analysis & Recommended Changes

*March 2026 — Analysis of Anki's APKG format vs LearnForge's schema*

---

## 1. APKG File Format Overview

An `.apkg` file is a **ZIP archive** containing:

```
collection.anki2    ← SQLite database (all cards, notes, scheduling)
media               ← JSON file mapping numeric keys to original filenames
0, 1, 2, ...       ← Media files renamed to numeric IDs
```

### APKG SQLite Schema (Anki 2.1+)

#### `notes` table — The source content
| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Timestamp-based ID (epoch ms) |
| `guid` | text | Globally unique ID for syncing |
| `mid` | integer | Model (note type) ID → references JSON in `col.models` |
| `mod` | integer | Modification timestamp (epoch seconds) |
| `usn` | integer | Update sequence number (-1 for new) |
| `tags` | text | Space-separated tags (e.g., ` biology anatomy `) |
| `flds` | text | Field values separated by `\x1f` (unit separator) |
| `sfld` | text | Sort field (first field by default) |
| `csum` | integer | Checksum of `sfld` for duplicate detection |
| `flags` | integer | Bitfield for user flags (colors) |
| `data` | text | Unused (empty string) |

**Key insight:** A note is NOT a card. A note has fields; card templates generate cards from fields. One note can produce multiple cards.

#### `cards` table — The reviewable items
| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Timestamp-based ID |
| `nid` | integer | Note ID → references `notes.id` |
| `did` | integer | Deck ID → references JSON in `col.decks` |
| `ord` | integer | Ordinal — which template/cloze number generated this card |
| `mod` | integer | Modification timestamp |
| `usn` | integer | Update sequence number |
| `type` | integer | 0=new, 1=learning, 2=review, 3=relearning |
| `queue` | integer | -3=sched buried, -2=user buried, -1=suspended, 0=new, 1=learning, 2=review, 3=day-learn, 4=preview |
| `due` | integer | Due date (day number for review, position for new, epoch for learning) |
| `ivl` | integer | Interval in days (negative = seconds for learning) |
| `factor` | integer | Ease factor × 1000 (e.g., 2500 = 2.5 ease) |
| `reps` | integer | Total review count |
| `lapses` | integer | Times card went from review → relearning |
| `left` | integer | Learning steps remaining (encoded) |
| `odue` | integer | Original due (when in filtered deck) |
| `odid` | integer | Original deck ID (when in filtered deck) |
| `flags` | integer | User flags (1=red, 2=orange, 3=green, 4=blue, 5-7 custom) |
| `data` | text | Extra data (JSON string, usually empty) |

#### `revlog` table — Review history
| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK | Timestamp of review (epoch ms) |
| `cid` | integer | Card ID |
| `usn` | integer | Update sequence number |
| `ease` | integer | Button pressed: 1=Again, 2=Hard, 3=Good, 4=Easy |
| `ivl` | integer | New interval after review (days, negative=seconds) |
| `lastIvl` | integer | Previous interval |
| `factor` | integer | New ease factor × 1000 |
| `time` | integer | Review duration in milliseconds |
| `type` | integer | 0=learn, 1=review, 2=relearn, 3=filtered/cram, 4=manual |

#### `col` table — Collection metadata (single row)
Contains JSON blobs for models, decks, and deck configs:

**Models (Note Types) JSON structure:**
```json
{
  "model_id": {
    "id": 1234567890,
    "name": "Basic",
    "type": 0,           // 0=standard, 1=cloze
    "flds": [            // Fields
      {"name": "Front", "ord": 0, "font": "Arial", "size": 20, ...},
      {"name": "Back", "ord": 1, ...}
    ],
    "tmpls": [           // Card templates
      {
        "name": "Card 1",
        "ord": 0,
        "qfmt": "{{Front}}",           // Question format
        "afmt": "{{FrontSide}}<hr>{{Back}}"  // Answer format
      }
    ],
    "css": ".card { font-family: arial; ... }",
    "sortf": 0           // Sort field index
  }
}
```

**Decks JSON structure:**
```json
{
  "deck_id": {
    "id": 1234567890,
    "name": "Medical::Anatomy::Upper Limb",  // :: = hierarchy separator
    "conf": 1,           // Deck config ID
    "dyn": 0,            // 0=normal, 1=filtered deck
    "desc": "Description text"
  }
}
```

**Deck Config JSON — Scheduling options:**
```json
{
  "new": {"perDay": 20, "order": 1, "bury": false},
  "rev": {"perDay": 200, "fuzz": 0.05, "ivlFct": 1.0, "maxIvl": 36500, "bury": false},
  "lapse": {"minInt": 1, "leechFails": 8, "delays": [10], "leechAction": 0},
  "maxTaken": 60
}
```

### Cloze Deletion Format

```
{{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.
```
- `c1`, `c2` etc. generate separate cards (one per number)
- `{{c1::answer::hint}}` — optional hint shown as `[hint]` instead of `[...]`
- Card `ord` field = cloze number - 1 (ord=0 for c1, ord=1 for c2)
- Note type must have `type=1` (cloze model)

### Media Mapping

The `media` file in the ZIP is a JSON object:
```json
{"0": "image.jpg", "1": "audio.mp3", "2": "diagram.svg"}
```
Files in the ZIP are named `0`, `1`, `2` etc. HTML references use the original filename: `<img src="image.jpg">`.

---

## 2. LearnForge Current Schema

### `cards` table
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | no | Random UUID |
| `topic_id` | uuid FK→topics | no | CASCADE delete |
| `concept` | text | no | Card concept (used for embeddings) |
| `front_html` | text | no | Full HTML for front |
| `back_html` | text | no | Full HTML for back |
| `tags` | text[] | yes | Array of tag strings, default `[]` |
| `embedding` | vector(384) | yes | MiniLM-L6-v2 embedding |
| `created_at` | timestamptz | no | |
| `updated_at` | timestamptz | no | |

### `topics` table (≈ Anki decks)
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | no | |
| `parent_id` | uuid FK→topics | yes | SET NULL delete |
| `user_id` | uuid FK→users | no | CASCADE delete |
| `name` | varchar(255) | no | |
| `description` | text | yes | |
| `created_at` | timestamptz | no | |

### `fsrs_state` table (1:1 with cards)
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `card_id` | uuid PK, FK→cards | no | CASCADE delete |
| `stability` | double | no | Default 0 |
| `difficulty` | double | no | Default 0 |
| `due` | timestamptz | no | |
| `last_review` | timestamptz | yes | |
| `reps` | integer | no | Default 0 |
| `lapses` | integer | no | Default 0 |
| `state` | smallint | no | 0=New, 1=Learning, 2=Review, 3=Relearning |

### `bloom_state` table (1:1 with cards)
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `card_id` | uuid PK, FK→cards | no | CASCADE delete |
| `current_level` | smallint | no | 0-5, default 0 |
| `highest_reached` | smallint | no | 0-5, default 0 |
| `updated_at` | timestamptz | no | |

### `reviews` table
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | no | |
| `card_id` | uuid FK→cards | no | CASCADE delete |
| `bloom_level` | smallint | no | |
| `rating` | smallint | no | 1-4 |
| `question_text` | text | no | |
| `modality` | text | no | 'web', 'chat', 'mcq' |
| `answer_expected` | text | yes | |
| `user_answer` | text | yes | |
| `reviewed_at` | timestamptz | no | |

### `images` table
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | no | |
| `card_id` | uuid FK→cards | yes | SET NULL delete |
| `user_id` | uuid FK→users | no | CASCADE delete |
| `filename` | varchar(255) | no | UUID-based on disk |
| `mime_type` | varchar(100) | no | |
| `created_at` | timestamptz | no | |

---

## 3. Schema Mapping: APKG → LearnForge

### What Maps Cleanly

| Anki Concept | LearnForge Equivalent | Mapping Complexity |
|-------------|----------------------|-------------------|
| Decks (hierarchy via `::`) | Topics (hierarchy via `parent_id`) | **Easy** — split on `::`, create topic chain |
| Cards.type/queue | fsrs_state.state | **Easy** — direct mapping (0-3) |
| Cards.reps, lapses | fsrs_state.reps, lapses | **Direct** |
| Revlog.ease | reviews.rating | **Direct** — both use 1-4 scale |
| Revlog.id (timestamp) | reviews.reviewed_at | **Easy** — convert epoch ms to timestamptz |
| Media files | images table + disk | **Easy** — copy files, insert rows |
| Notes.tags | cards.tags | **Easy** — split space-separated string to array |
| Cards.flags | No equivalent | **Lossy** — could map to tags |

### What Requires Transformation

| Anki Concept | Challenge | Solution |
|-------------|-----------|----------|
| **SM-2 factor/ivl → FSRS** | SM-2 uses ease factor (2500) + interval (days). FSRS uses stability + difficulty. Not directly convertible. | Use `ts-fsrs` converter or initialize FSRS from review history. Alternatively, import with approximate FSRS params and let them converge over a few reviews. |
| **Note → Card (1:many)** | One Anki note generates 1+ cards. LearnForge has no note concept. | Flatten: each Anki card becomes a separate LearnForge card. The note's fields populate front/back HTML via the template. |
| **Templates → HTML** | Anki card templates use `{{FieldName}}` substitution. LearnForge stores final HTML. | Render templates at import time: substitute fields into qfmt/afmt, apply CSS, produce final HTML. |
| **Cloze → HTML** | `{{c1::answer::hint}}` generates blanked-out versions. | Must either (a) render as static HTML with blanks, or (b) add cloze card type support. |
| **Deck config (daily limits, steps)** | LearnForge has no per-topic study options. | Either add topic-level study config, or ignore (use global FSRS defaults). |
| **Filtered decks** | LearnForge has no filtered/dynamic decks. | Skip filtered decks during import (they're temporary by nature). |
| **Suspended/buried cards** | LearnForge has no suspend/bury mechanism. | Either add a `suspended` boolean to cards, or skip these cards. |

### What Has No Equivalent

| Anki Concept | LearnForge Gap | Impact |
|-------------|---------------|--------|
| Note types (models) with fields | No note/field system | **Critical** — can't round-trip; import is one-way flatten |
| Card templates (qfmt/afmt) | No template system | **Critical** — must render at import time |
| Cloze card type | No cloze support | **Critical** — can't import cloze cards without adding support |
| Image occlusion | No IO support | **Medium** — IO cards become static images without masks |
| Type-in-the-answer | No type-in support | **Low** — rare card type, can render as standard |
| `due` as day-number for reviews | Uses timestamptz | **Easy** — convert: `collection_creation_date + due * 86400` |
| Review time (ms) | Not tracked | **Low** — could add column or discard |

---

## 4. Proposed Schema Changes — Rated

### Rating Scale
- **Benefit Score (0-10):** How much value this adds to LearnForge overall
- **Import Necessity:** Is this needed for APKG import specifically?
- **Feature Unlock:** What new features does this enable beyond import?

---

### Change #1: Add `card_type` column to cards table
**Benefit: 9/10** | Effort: S | Import Necessity: REQUIRED for cloze

```sql
ALTER TABLE cards ADD COLUMN card_type varchar(20) NOT NULL DEFAULT 'standard';
-- Values: 'standard', 'cloze', 'image_occlusion'
```

**What it enables:**
- Cloze deletion cards (the #2 most requested feature)
- Image occlusion cards (medical students)
- Future card types without schema changes
- Proper rendering logic per card type in the UI

**Why do it:** Without this, cloze cards from APKG files cannot be meaningfully imported. They'd be flattened to static HTML, losing their interactive nature. Cloze is the most popular card type among serious Anki users.

**What NOT to do:** Don't replicate Anki's full note type/template system. It's massively complex and LearnForge's HTML-per-card model is simpler and more flexible for AI generation. Just add a type discriminator.

---

### Change #2: Add `cloze_data` JSON column to cards table
**Benefit: 9/10** | Effort: S | Import Necessity: REQUIRED for cloze

```sql
ALTER TABLE cards ADD COLUMN cloze_data jsonb;
-- Example: {"deletions": [{"index": 1, "answer": "mitochondria", "hint": null}, {"index": 2, "answer": "powerhouse", "hint": "p..."}]}
```

**What it enables:**
- Stores the structured cloze data alongside the display HTML
- Allows the UI to render interactive cloze (click to reveal each blank)
- Each cloze deletion can become a separate study item via the `ord` concept
- AI tutoring can use the structured data for intelligent questioning

**Alternative:** Store cloze syntax directly in `front_html` (e.g., `{{c1::text}}`). Simpler but requires client-side parsing. The JSON approach is cleaner for the API.

---

### Change #3: Add `suspended` boolean to cards table
**Benefit: 7/10** | Effort: S | Import Necessity: HIGH (preserves Anki card state)

```sql
ALTER TABLE cards ADD COLUMN suspended boolean NOT NULL DEFAULT false;
```

**What it enables:**
- Preserve suspended/buried state from Anki imports
- Users can temporarily exclude cards from study without deleting them
- Essential for managing large card collections (leech handling, exam scoping)
- Addresses the "card suspend/bury" gap from the competitive analysis (scored 5.8)

**Import mapping:** `cards.queue = -1` → `suspended = true`. Buried cards (`queue = -2/-3`) can be imported as non-suspended (bury is session-temporary in Anki).

---

### Change #4: Add `flags` column to cards table
**Benefit: 5/10** | Effort: S | Import Necessity: MEDIUM (preserves user organization)

```sql
ALTER TABLE cards ADD COLUMN flags smallint NOT NULL DEFAULT 0;
-- Anki uses: 1=red, 2=orange, 3=green, 4=blue, 5=pink, 6=turquoise, 7=purple
```

**What it enables:**
- Preserves Anki flag colors on import
- Quick visual marking system during review ("flag this for later")
- Simpler than tags for quick in-review marking
- Could double as a priority/attention indicator

**Alternative:** Map flags to tags during import (e.g., flag:red). Less lossy but not round-trippable.

---

### Change #5: Add `source` metadata column to cards table
**Benefit: 6/10** | Effort: S | Import Necessity: USEFUL (track provenance)

```sql
ALTER TABLE cards ADD COLUMN source jsonb;
-- Example: {"type": "anki_import", "anki_note_id": 1234567890, "anki_card_ord": 0, "anki_model": "Basic", "imported_at": "2026-03-20T..."}
```

**What it enables:**
- Track which cards came from Anki imports vs AI creation vs manual
- Prevent duplicate imports (check `anki_note_id` exists)
- Store original Anki note ID for reference/debugging
- Future: re-import updates from newer deck versions
- Analytics: "what source produces the best retention?"

---

### Change #6: Add `review_duration_ms` to reviews table
**Benefit: 4/10** | Effort: S | Import Necessity: LOW (Anki tracks this, we don't)

```sql
ALTER TABLE reviews ADD COLUMN review_duration_ms integer;
```

**What it enables:**
- Preserves Anki's review timing data on import
- Enables "time spent studying" analytics
- Could feed into FSRS optimizer (review time correlates with difficulty)
- Dashboard: "You studied for 45 minutes today"

**Why lower priority:** LearnForge currently doesn't track review time at all. Adding the column is trivial but requires UI/API changes to populate it for new reviews too.

---

### Change #7: Add `original_ivl` and `previous_ivl` to reviews table
**Benefit: 3/10** | Effort: S | Import Necessity: LOW (for revlog fidelity)

```sql
ALTER TABLE reviews ADD COLUMN interval_days integer;
ALTER TABLE reviews ADD COLUMN previous_interval_days integer;
```

**What it enables:**
- Preserves Anki's revlog interval data
- Enables interval distribution graphs (Anki-style statistics)
- Could be used by future FSRS optimizer for parameter tuning

**Why lower priority:** Useful for analytics but not functionally impactful. The FSRS state already captures the current interval implicitly via stability.

---

### Change #8: Add `note_type` or `card_template_id` system
**Benefit: 6/10** | Effort: L-XL | Import Necessity: NOT REQUIRED (can flatten)

This would be a new `note_types` table:
```sql
CREATE TABLE note_types (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  type varchar(20) NOT NULL DEFAULT 'standard', -- 'standard', 'cloze'
  fields jsonb NOT NULL, -- [{name, ord, ...}]
  templates jsonb NOT NULL, -- [{name, qfmt, afmt, ...}]
  css text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cards ADD COLUMN note_type_id uuid REFERENCES note_types(id);
ALTER TABLE cards ADD COLUMN fields jsonb; -- structured field data
```

**What it enables:**
- Full round-trip fidelity with Anki imports
- One note → multiple cards (e.g., forward + reverse)
- Reusable templates for card creation
- Anki-style field system (separate data from presentation)

**Why NOT recommended (yet):**
- **Massive architectural change** — touches card creation, editing, study, MCP tools, AI generation
- **Conflicts with LearnForge's design** — per-card HTML is simpler, more flexible for AI, and supports interactive elements that templates can't
- **Anki's template system is its biggest UX pain point** — users struggle with `{{FieldName}}` syntax, template editing, CSS debugging
- **Flattening at import is acceptable** — render templates at import time, store as final HTML. Users can edit the HTML afterward.
- **Defer to Phase 4** — only build this if user feedback strongly demands it after launch

---

### Change #9: Add study options to topics table
**Benefit: 5/10** | Effort: M | Import Necessity: LOW (can use global defaults)

```sql
ALTER TABLE topics ADD COLUMN study_options jsonb;
-- Example: {"new_per_day": 20, "review_per_day": 200, "learning_steps": [1, 10], "order": "due_asc"}
```

**What it enables:**
- Per-topic daily limits (Anki's most-used deck option)
- Import Anki deck configs
- Different study intensity per subject
- "I want 50 new cards/day in Japanese but only 10 in Chemistry"

**Why medium priority:** Many users want this, but it works fine without it. Global FSRS defaults are reasonable. Could add later when users ask.

---

### Change #10: Add `anki_ease_factor` to fsrs_state (import helper)
**Benefit: 3/10** | Effort: S | Import Necessity: USEFUL for SM-2 → FSRS conversion

```sql
ALTER TABLE fsrs_state ADD COLUMN legacy_ease_factor integer;
-- Stores the original Anki ease factor (e.g., 2500 = 2.5) for reference during conversion
```

**What it enables:**
- Preserves original Anki scheduling data during import
- Allows better SM-2 → FSRS conversion (use ease factor to estimate difficulty)
- Debugging aid if users report scheduling feels wrong after import

**Why lower priority:** Could be handled entirely at import time (compute FSRS params from ease factor, don't store the original). The `source` jsonb column (Change #5) could store this instead.

---

## 5. Import Challenges & Solutions

### Challenge 1: SM-2 → FSRS State Conversion
**Severity: HIGH**

Anki stores SM-2 parameters: `factor` (ease × 1000), `ivl` (interval in days), `due` (day number), `reps`, `lapses`.

LearnForge uses FSRS: `stability`, `difficulty`, `due` (timestamp), `reps`, `lapses`, `state`.

**Three cases to handle:**

| Anki User Type | What's in the APKG | Conversion |
|---|---|---|
| **FSRS enabled** | `stability` + `difficulty` in `cards.data` field, `fsrsWeights` in deck config | **Copy directly** — same algorithm, no conversion needed |
| **SM-2 with review history** | `factor` + `ivl` on cards, full `revlog` table | **Replay revlog through ts-fsrs** — most accurate |
| **SM-2 without enough history** | `factor` + `ivl` only, sparse/no revlog | **Heuristic approximation** — quick but less accurate |

**Detection:** Check `dconf[id].fsrsWeights` — if present and non-empty, user had FSRS enabled. Otherwise SM-2.

**Solution options for SM-2 cards:**

| Approach | Fidelity | Complexity |
|----------|----------|------------|
| **A) Replay revlog through FSRS** | Highest | Medium — feed each card's review history through `ts-fsrs` to compute proper S/D |
| **B) Heuristic mapping** | Medium | Low — `stability ≈ ivl`, `difficulty ≈ (3.0 - factor/1000) * 3.33` |
| **C) Import as "new" cards** | None | Trivial — loses all scheduling. Users hate this. |

**Recommendation:** Use **A** (revlog replay) as the primary approach — `ts-fsrs` can process review sequences to compute proper stability/difficulty. Fall back to **B** (heuristic) only for cards with no review history. Never do **C**.

Heuristic fallback (for cards without revlog):
```
stability = max(ivl, 1)
difficulty = clamp(11 - (factor / 1000) * 3.7, 1, 10)
due = collection_creation_date + (due * 86400000)  // for review cards
state = cards.type  // 0-3 maps directly
reps = cards.reps
lapses = cards.lapses
```

### Challenge 2: Template Rendering at Import Time
**Severity: HIGH**

Anki cards are generated dynamically from note fields + templates. LearnForge needs final HTML.

**Solution:** At import time, for each Anki card:
1. Get the note's model (note type) from `col.models`
2. Get the template for this card's `ord`
3. Substitute `{{FieldName}}` in `qfmt` and `afmt` with actual field values
4. Handle special substitutions: `{{FrontSide}}`, `{{Tags}}`, `{{Deck}}`, `{{type:FieldName}}`
5. Apply the model's CSS
6. For cloze: render `{{c1::answer}}` as `[...]` on front, reveal on back
7. Store rendered HTML in `front_html` and `back_html`

**Complexity:** Medium. The template substitution is straightforward regex. The edge cases are:
- Conditional sections: `{{#FieldName}}...{{/FieldName}}` (show block only if field non-empty)
- Cloze rendering: must blank the correct cloze number per card
- Custom JavaScript in templates: may not work in LearnForge's sandboxed iframe

### Challenge 3: Cloze Card Handling
**Severity: HIGH**

One cloze note with 3 cloze deletions generates 3 cards (ord 0, 1, 2). Each shows a different blank.

**Solution options:**

| Approach | Pros | Cons |
|----------|------|------|
| **A) Flatten to separate cards** | Simple, works with current schema | Loses the "shared note" relationship; editing one doesn't update others |
| **B) Add cloze card type** | Proper support, interactive review | Requires schema change (#1, #2) and UI work |
| **C) Single card with all clozes** | Simplest | Doesn't match Anki behavior; confusing |

**Recommendation:** **B** — Add proper cloze support. It's the #2 most important feature from the competitive analysis. Import is the forcing function to build it right.

### Challenge 4: Media File Migration
**Severity: MEDIUM**

APKG media files are numbered (0, 1, 2...) in the ZIP. The `media` JSON maps numbers to filenames. Card HTML references original filenames.

**Solution:**
1. Extract media files from ZIP
2. Read `media` JSON mapping
3. For each file: rename to UUID, store on disk, create `images` row
4. Rewrite HTML references: `<img src="image.jpg">` → `<img src="/images/{uuid}">`
5. Handle audio: `[sound:file.mp3]` → `<audio src="/images/{uuid}" controls>`

**Gotcha:** Anki audio uses `[sound:filename]` syntax, not HTML `<audio>` tags. Must convert during import.

### Challenge 5: Deck Hierarchy → Topic Tree
**Severity: LOW**

Anki uses `::` in deck names for hierarchy: `Medical::Anatomy::Upper Limb`.

**Solution:** Split on `::`, create topic chain top-down, reuse existing topics if names match within the same user's collection. Map deck descriptions to topic descriptions.

### Challenge 6: Duplicate Detection
**Severity: MEDIUM**

Users may import the same deck multiple times, or import decks that overlap with existing cards.

**Solution:** Use the `source.anki_note_id` from Change #5 to detect duplicates. Options on conflict: skip, update, or create duplicate. Let the user choose.

---

## 6. What NOT to Change (and Why)

### DO NOT add Anki's note type / template system
- LearnForge's per-card HTML model is **fundamentally better for AI generation**
- Templates work for human-created cards but constrain AI creativity
- The template system is Anki's #1 UX complaint from new users
- Flatten at import time; don't reproduce the complexity

### DO NOT add `factor` (ease) to FSRS state
- FSRS doesn't use ease factors — it has `stability` and `difficulty`
- Storing ease would create confusion about which scheduling system is active
- Convert at import time, then let FSRS manage scheduling natively

### DO NOT add `usn` (update sequence number)
- USN is Anki's sync protocol concept
- LearnForge is a centralized web app — sync is implicit
- No value in storing this

### DO NOT add `guid` to cards
- GUID is for Anki's peer-to-peer sync and conflict resolution
- LearnForge uses UUIDs and server-authoritative state
- The `source.anki_note_id` serves the duplicate detection purpose

### DO NOT replicate deck config in detail
- Anki's `dconf` has dozens of knobs (fuzz factor, leech threshold, bury settings, etc.)
- Most users never touch these settings
- Simple per-topic `new_per_day` / `review_per_day` (Change #9) covers 95% of the use case

### DO NOT add `left` (learning steps remaining)
- This is SM-2/Anki scheduler internal state
- FSRS handles learning progression differently (via `state` + `stability`)
- Not meaningful in LearnForge's context

---

## 7. Summary: Changes Ranked by Benefit

| Rank | Change | Benefit | Effort | Import Need | Features Unlocked |
|------|--------|---------|--------|-------------|-------------------|
| **1** | **`card_type` column** | **9/10** | S | Required | Cloze, image occlusion, future card types |
| **2** | **`cloze_data` JSON column** | **9/10** | S | Required | Interactive cloze review, AI cloze tutoring |
| **3** | **`suspended` boolean** | **7/10** | S | High | Card suspension, leech management, exam scoping |
| **4** | **`source` JSON column** | **6/10** | S | Useful | Import tracking, duplicate detection, analytics |
| **5** | **`flags` column** | **5/10** | S | Medium | Quick marking during review, preserves Anki flags |
| **6** | **Study options on topics** | **5/10** | M | Low | Per-topic daily limits, study intensity control |
| **7** | **`review_duration_ms`** | **4/10** | S | Low | Time-spent analytics, study duration tracking |
| **8** | **`interval_days` on reviews** | **3/10** | S | Low | Interval distribution graphs, optimizer data |
| **9** | **`legacy_ease_factor`** | **3/10** | S | Low | Better SM-2→FSRS conversion debugging |
| **10** | **Note type / template system** | **6/10** | XL | Not required | Round-trip fidelity, reusable templates — **DEFER** |

### Quick Wins (do now, S effort, high value):
**Changes #1, #2, #3** — These three small schema additions unlock cloze cards AND proper APKG import. Total effort: a few days.

### Do During Import Implementation:
**Changes #4, #5** — Flags and source metadata are cheap to add and improve import fidelity.

### Do Later Based on Demand:
**Changes #6, #7, #8** — Study options and review analytics. Nice to have, not blocking.

### Explicitly Defer:
**Change #10** — Note type system. Too complex, conflicts with AI-first design. Flatten at import instead.

---

## 8. Recommended Import Architecture

```
User uploads .apkg file
        ↓
   Unzip archive
        ↓
   Parse media JSON mapping
        ↓
   Open SQLite database
        ↓
   Read col.models (note types)
   Read col.decks (deck hierarchy)
        ↓
   ┌──────────────────────────────┐
   │  For each deck:              │
   │    → Create/find topic       │
   │    (split :: for hierarchy)  │
   └──────────────────────────────┘
        ↓
   ┌──────────────────────────────┐
   │  For each note:              │
   │    → Get model (note type)   │
   │    → Parse fields (\x1f)     │
   │    → Parse tags              │
   │    → For each card on note:  │
   │      → Render template       │
   │      → Handle cloze if type=1│
   │      → Convert scheduling    │
   │      → Create card + states  │
   └──────────────────────────────┘
        ↓
   ┌──────────────────────────────┐
   │  For each media file:        │
   │    → Extract from ZIP        │
   │    → Store on disk (UUID)    │
   │    → Create images row       │
   │    → Rewrite HTML references │
   └──────────────────────────────┘
        ↓
   ┌──────────────────────────────┐
   │  For each revlog entry:      │
   │    → Create review record    │
   │    → Map ease → rating       │
   │    → Map type → modality     │
   └──────────────────────────────┘
        ↓
   Import summary: X cards, Y topics,
   Z media files, W reviews imported
```

### Estimated Implementation Effort

| Component | Effort | Notes |
|-----------|--------|-------|
| Schema migration (changes #1-5) | S (1-2 days) | Simple ALTER TABLE statements |
| APKG parser (ZIP + SQLite + media) | M (3-5 days) | Use `better-sqlite3` or `sql.js` for SQLite in Node |
| Template renderer | M (3-5 days) | Regex-based field substitution, cloze rendering |
| SM-2 → FSRS converter | S (1-2 days) | Heuristic mapping |
| Media migration | S (1-2 days) | Extract + rename + rewrite HTML |
| Cloze card UI support | M (5-7 days) | New card type rendering in study + browser |
| API endpoint + upload | S (1-2 days) | Multipart upload, async processing |
| **Total** | **M-L (3-4 weeks)** | |
