# LearnForge Database Class Diagram

```mermaid
erDiagram
    topics {
        uuid id PK
        uuid parent_id FK "self-ref, SET NULL"
        varchar(255) name "NOT NULL"
        text description
        timestamptz created_at "NOT NULL, default NOW()"
    }

    cards {
        uuid id PK
        uuid topic_id FK "NOT NULL, CASCADE"
        text concept "NOT NULL"
        text front_html "NOT NULL"
        text back_html "NOT NULL"
        text[] tags "default []"
        vector(384) embedding "nullable, cosine similarity"
        timestamptz created_at "NOT NULL, default NOW()"
        timestamptz updated_at "NOT NULL, auto-update"
    }

    bloom_state {
        uuid card_id PK,FK "CASCADE"
        smallint current_level "NOT NULL, default 0 (0-5)"
        smallint highest_reached "NOT NULL, default 0 (0-5)"
        timestamptz updated_at "NOT NULL, auto-update"
    }

    fsrs_state {
        uuid card_id PK,FK "CASCADE"
        double stability "NOT NULL, default 0"
        double difficulty "NOT NULL, default 0"
        timestamptz due "NOT NULL, default NOW()"
        timestamptz last_review "nullable"
        int reps "NOT NULL, default 0"
        int lapses "NOT NULL, default 0"
        smallint state "NOT NULL, default 0 (0-3)"
    }

    reviews {
        uuid id PK
        uuid card_id FK "NOT NULL, CASCADE"
        smallint bloom_level "NOT NULL (0-5)"
        smallint rating "NOT NULL (1-4)"
        text question_text "NOT NULL"
        text modality "NOT NULL, default 'web'"
        text answer_expected "nullable"
        text user_answer "nullable"
        timestamptz reviewed_at "NOT NULL, default NOW()"
    }

    images {
        uuid id PK
        uuid card_id FK "nullable, SET NULL"
        varchar(255) filename "NOT NULL"
        varchar(100) mime_type "NOT NULL"
        timestamptz created_at "NOT NULL, default NOW()"
    }

    topics ||--o{ topics : "parent_id (self-ref)"
    topics ||--o{ cards : "topic_id"
    cards ||--o| bloom_state : "card_id (1:1)"
    cards ||--o| fsrs_state : "card_id (1:1)"
    cards ||--o{ reviews : "card_id"
    cards ||--o{ images : "card_id"
```

## Table Descriptions

### topics
Hierarchical topic tree. Self-referencing `parent_id` allows unlimited nesting. Deleting a parent sets children's `parent_id` to NULL (orphans become root topics).

### cards
Flashcards belonging to a topic. Each card has HTML for front (question) and back (answer), a concept label, optional tags, and a 384-dimensional embedding vector (MiniLM-L6-v2) for similarity search. Cascade-deletes when the parent topic is removed.

### bloom_state
1:1 with cards. Tracks Bloom's Taxonomy progression:
- `current_level`: 0=Remember, 1=Understand, 2=Apply, 3=Analyze, 4=Evaluate, 5=Create
- `highest_reached`: watermark of the highest level ever achieved
- Transition: rating >= 3 advances one level, rating <= 2 drops one level

### fsrs_state
1:1 with cards. FSRS (Free Spaced Repetition Scheduler) scheduling state:
- `state`: 0=New, 1=Learning, 2=Review, 3=Relearning
- `stability`: interval (in days) at which recall probability = 90%
- `difficulty`: card difficulty parameter (0-10 range)
- `due`: next review timestamp
- Modality multipliers adjust intervals: chat (1.25x), web (1.0x), mcq (0.75x)
- Card maturity classification: Young (state=2, stability < 21d), Mature (state=2, stability >= 21d)

### reviews
Review log. Many reviews per card. Records the Bloom level at review time, the FSRS rating (1=Again, 2=Hard, 3=Good, 4=Easy), the question text used, the study modality (chat/web/mcq), the expected correct answer (`answer_expected`), and the user's actual response (`user_answer`). The `question_text` contains the full question including MCQ options; `answer_expected` stores the ideal answer and `user_answer` stores what the user responded, enabling review of past mistakes.

### images
File-based image storage. Optionally linked to a card (`SET NULL` on card delete so orphan images can be cleaned up separately). Physical files stored at `IMAGE_PATH`.

## Relationship Summary

| Relationship | Type | On Delete |
|---|---|---|
| topics.parent_id -> topics.id | self-ref, optional | SET NULL |
| cards.topic_id -> topics.id | many-to-one, required | CASCADE |
| bloom_state.card_id -> cards.id | one-to-one, PK+FK | CASCADE |
| fsrs_state.card_id -> cards.id | one-to-one, PK+FK | CASCADE |
| reviews.card_id -> cards.id | many-to-one, required | CASCADE |
| images.card_id -> cards.id | many-to-one, optional | SET NULL |
