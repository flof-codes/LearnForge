# LearnForge instructions audit

## Executive summary

This document audits the LearnForge MCP tutor instructions (`get_instructions` output) and card templates (`get_templates` output) based on real study session experience. It identifies clarity issues, missing guidance, redundancies, workflow bottlenecks, and contradictions — then proposes concrete fixes for each.

The single biggest improvement opportunity is **turn pipelining**: restructuring the study session flow so the AI pre-composes the next question during the user's thinking time, eliminating the latency users feel between answering and seeing the next question.

---

## 1. Critical: turn pipelining (latency optimization)

### Problem

The current instructions describe a sequential flow:

1. User answers question N
2. AI evaluates the answer
3. AI generates feedback
4. AI reads the next card's data
5. AI generates question N+1 (check review history for variety, apply `optionShuffle`, compose options)
6. AI outputs feedback + question text
7. AI calls `submit_review` + `ask_user_input`

Steps 2–5 all happen in the AI's thinking phase _after_ the user answers. The user stares at a loading indicator while the AI does heavy generation work. In practice, this creates a 5–15 second gap between answering and seeing the next question — long enough to break study flow.

### Root cause

The instructions treat each turn as fully self-contained. There is no concept of preparing future work during idle time.

### Proposed fix: parallel pipelining

Restructure the turn into two phases that exploit the fact that **after the AI presents a question, the user needs time to think — and the AI can use that time to prepare the next turn.**

**New turn structure:**

```
Turn N (user answers question N):
  Phase 1 — FAST (user-facing, minimize thinking):
    1. Evaluate answer (instant — correct answer was pre-composed)
    2. Output feedback (2-3 sentences)
    3. Output question N+1 text (pre-composed — just print it)
    4. Call submit_review for card N + ask_user_input for card N+1

  Phase 2 — SLOW (happens while user reads/thinks about N+1):
    5. Read card N+2 data (concept, bloom level, review history)
    6. Generate question N+2 (check previous question_text for variety)
    7. Apply optionShuffle for N+2
    8. Note correct answer(s) and prepare feedback variants
```

**Cold start exception:** The very first question in a session has nothing pre-composed. This is acceptable — one slow turn per session.

**Edge case — last card in batch:** When presenting the last pre-fetched card, Phase 2 should call `get_study_cards` for the next batch and pre-compose from the first card of that batch.

### Proposed instruction text

Add a new section after "Study Session Flow" step 4f:

```markdown
## Pipelining for Speed

After presenting question N via `ask_user_input`, use your remaining
thinking capacity to pre-compose question N+1:

1. Read the next card's concept, bloomState.currentLevel, and reviews
   (to ensure question variety).
2. Generate the complete question text + 4 options.
3. Apply optionShuffle to determine option placement.
4. Note the correct answer(s) and prepare feedback variants for
   right/wrong.

When the user answers question N, your visible output should be:
→ Evaluate (using pre-composed correct answer)
→ Feedback (2-3 sentences)
→ Pre-composed question N+1 text
→ submit_review for N + ask_user_input for N+1

Then immediately begin pre-composing question N+2 in thinking.

This minimizes the time between the user answering and seeing the
next question. The user's thinking time (reading the question,
deciding on an answer) is your preparation time.
```

---

## 2. Tool name mismatch: `AskUserQuestion` vs `ask_user_input_v0`

### Problem

The instructions reference a tool called `AskUserQuestion` multiple times (step 4e, 4f). The actual tool available in Claude.ai is `ask_user_input_v0`, with different parameter names.

### Impact

An AI following the instructions literally would look for a tool that doesn't exist. In practice, the AI infers the correct tool, but this adds unnecessary ambiguity.

### Proposed fix

Replace all references to `AskUserQuestion` with `ask_user_input_v0` and document its actual parameter structure:

```markdown
Present the question using the `ask_user_input_v0` tool:

- questions: array of question objects
- Each question has: question (text), options (array of strings),
  type ("single_select" or "multi_select")
```

---

## 3. Ambiguous `optionShuffle` specification

### Problem

The instructions say:

> "Put your first option at position optionShuffle[0], second at optionShuffle[1], etc."

This is ambiguous. What does "position" mean? Visual position 1–6? Array index? And what does "your first option" refer to — the first option I generate, or the first correct option?

### Example of ambiguity

If I generate options [A_correct, B_wrong, C_wrong, D_correct] and `optionShuffle = [3, 1, 4, 2]`, does that mean:

- Interpretation 1: Option A goes to visual position 3, Option B to position 1, etc.
- Interpretation 2: The option at generated index 3 goes first, then index 1, etc.

### Proposed fix

Rewrite with an explicit, unambiguous example:

```markdown
### optionShuffle — randomizing option placement

Each card includes an `optionShuffle` array (e.g. [3, 1, 6, 2, 5, 4]).
Use it as a sorting key to determine the DISPLAY ORDER of your options.

Algorithm:

1. Generate your N options (e.g. 4 options for a single_select).
2. Take the first N values from optionShuffle.
3. Pair each option with its shuffle value.
4. Sort by shuffle value ascending — that's the display order.

Example:
Generated options: [Opt_A, Opt_B, Opt_C, Opt_D]
optionShuffle: [3, 1, 6, 2, ...]
Pairs: [(Opt_A, 3), (Opt_B, 1), (Opt_C, 6), (Opt_D, 2)]
Sorted: [(Opt_B, 1), (Opt_D, 2), (Opt_A, 3), (Opt_C, 6)]
Display order: Opt_B, Opt_D, Opt_A, Opt_C

This prevents the AI from unconsciously placing correct answers in
predictable positions (e.g. always first or always "C").
```

---

## 4. Missing guidance: mid-quiz topic exploration

### Problem

In our session, the user asked to pause the quiz and discuss CSP in depth — exploring directives, source expressions, `.htaccess` behavior, and server configuration. The instructions have no guidance for this scenario.

Current instructions imply a rigid loop: present card → user answers → evaluate → next card. But real learning is nonlinear — users ask "wait, what is this?" and want to explore before continuing.

### Impact

Without guidance, the AI has to improvise: should it rate the card? Skip it? Come back to it? How does it re-enter the quiz flow?

### Proposed fix

Add a new section:

```markdown
## Handling Mid-Quiz Exploration

If the user pauses the quiz to ask questions or explore a topic:

1. ALWAYS prioritize the user's curiosity — learning > quiz completion.
2. If the user explicitly didn't answer the card question, rate it as
   1 (Again) with user_answer noting the exploration context.
3. If the user answered correctly before exploring, rate normally.
4. When the user wants to resume ("let's continue", "back to the
   quiz"), pick up where you left off in the card queue.
5. Don't restart the session or re-fetch cards unless the batch is
   exhausted.
```

---

## 5. Missing guidance: "I don't know" answers

### Problem

The instructions cover correct, partially correct, and wrong answers — but not "I don't know" or refusal to answer. In our session, the user said "what's unsafe eval? Don't know what that means."

### Proposed fix

Add to the Response Evaluation Guide:

```markdown
### "I Don't Know" Responses

If the user says they don't know or asks for explanation:

1. Do NOT immediately reveal the answer.
2. Give a targeted hint — enough context to reason through it.
3. Re-present the same question (same options, same order).
4. If the user still can't answer after 2 hints, explain the answer
   and rate as 1 (Again).
5. Log user_answer as the explanation context
   (e.g. "Did not answer — needed explanation of X").
```

---

## 6. Missing guidance: session initialization

### Problem

The instructions don't explicitly state that the AI should call `get_instructions` at the start of every session. In our session, I skipped it entirely and the user had to tell me to read it.

### Proposed fix

Add a prominent note at the very top:

```markdown
## IMPORTANT: Session Initialization

At the start of EVERY study or card creation session, call
`get_instructions` FIRST before doing anything else. Do not rely
on cached knowledge of these instructions — they may have been
updated. This is non-negotiable.
```

---

## 7. Contradiction: open-response template vs front side rules

### Problem

The instructions state:

> "NO input fields, NO textareas, NO submit buttons on the front. The front is a static question prompt only."

But the open-response template (`get_templates` → "open-response") contains exactly these elements: a `<textarea>`, a submit button, and associated JavaScript. This directly contradicts the front side rules.

### Impact

This is explicitly flagged in the user's memory edits as a known issue:

> "The open-response template's textarea is misleading; ignore it for front_html and just render the bloom tag + question text."

The fact that this needs a memory override means the instructions are broken.

### Proposed fix

Either:

**Option A (preferred):** Remove the textarea/button from the open-response template entirely. Make it a clean question prompt only. The template description should say: "Static question prompt for open-response questions. The user answers in the chat, not in the card."

**Option B:** Split the template into `open-response-front` (static prompt) and `open-response-back` (with textarea for self-study/web mode). Add a clear note that the textarea version is ONLY for web self-study, never for chat sessions.

---

## 8. Unclear: "web" modality

### Problem

The instructions define three modalities:

- **chat**: "AI asks open questions, user types answers, AI evaluates. Deepest learning — interval gets 1.2× boost."
- **mcq**: "AI-generated multiple-choice — interval boosted to 1.05×."
- **web**: Only mentioned in the `submit_review` parameters as "self-rating, 0.95×" — no explanation in the study session flow.

### Impact

It's unclear when or how "web" modality would be triggered in a chat session. Is it for a separate web UI? Is it ever relevant in the chat context?

### Proposed fix

Add a brief explanation in the modality section:

```markdown
- **web** (self-study): User studies cards independently in a web
  interface and self-rates their recall. No AI evaluation — interval
  penalized to 0.95×. Not applicable in chat sessions; included for
  API completeness.
```

---

## 9. Redundancy: visual style section vs templates

### Problem

The instructions contain a detailed "Visual Style (Dark Theme)" section with hex colors, CSS class prefixes, KaTeX setup, and SVG guidelines. This same information is embedded in every template returned by `get_templates`.

### Impact

Duplicated information means two places to update when the theme changes. It also adds ~30 lines to the instructions that the AI must process every session.

### Proposed fix

Keep a minimal reference in the instructions (just the key colors for quick reference) and point to `get_templates` for the authoritative CSS:

```markdown
## Visual Style (Quick Reference)

Dark theme. Key colors: bg #111827, text #e0e4ef, accent green
#6ee7b7, accent blue #3b82f6. All CSS classes prefixed with `lf-`.

For complete CSS, KaTeX setup, and SVG guidelines, see `get_templates`.
```

---

## 10. Missing: batch exhaustion handling

### Problem

The instructions say to call `get_study_cards` with limit=5, but don't address what happens when those 5 cards are done and more are due.

### Proposed fix

Add to the Study Session Flow:

```markdown
After reviewing all cards in the current batch, call
`get_study_cards` again to check for remaining due cards. If the
result is empty, proceed to the session summary. If more cards are
returned, continue the session with the new batch.

When using pipelining: if you're pre-composing from the last card in
a batch, call get_study_cards in your Phase 2 thinking to have the
next batch ready.
```

---

## 11. Feedback-first flow is underspecified for edge cases

### Problem

Step 4f says "feedback comes FIRST, saving comes AFTER" and describes the MCQ flow as:

1. Give feedback on current card
2. Write the NEXT card's question
3. Call submit_review for current card
4. Present the NEXT card's answer options

But what happens when:

- The user disputes the evaluation? (feedback was already given)
- The submit_review call fails? (card was already presented as "done")
- The user wants to re-answer the same card?

### Proposed fix

Add error handling guidance:

```markdown
### Edge Cases

- **User disputes evaluation:** Acknowledge, re-evaluate, and call
  submit_review with the corrected rating. Do not re-present the
  same card — the user has already seen the answer.
- **submit_review fails:** Retry once. If it fails again, note the
  failure and continue — don't block the session. Inform the user
  that one review wasn't saved.
- **User wants to re-study a card:** This is not a re-answer. Continue
  the session normally — FSRS will schedule the card for review based
  on the rating given.
```

---

## 12. 105-character truncation warning is buried

### Problem

The MCQ option length limit for `ask_user_input` is mentioned in the instructions, but it's buried in a sub-bullet under step 4e. This is a critical rendering issue — truncated options make questions unreadable.

### Proposed fix

Make it more prominent — either a callout box or move it to the top of the MCQ presentation section:

```markdown
### CRITICAL: MCQ option length limit

The ask_user_input widget truncates option text at 105 characters.
Before presenting any MCQ:

1. Check if ANY option exceeds 105 characters.
2. If yes, use the letter-key pattern: display full options (A-D with
   complete text) in the chat message, then present only "A", "B",
   "C", "D" as widget options.
3. Never present truncated options — the user must always read the
   full text.
```

---

## 13. Bloom level table could be more actionable

### Problem

The Bloom's Taxonomy Question Guide table lists stems and card types per level but doesn't give concrete question-generation patterns. The AI has to figure out what "Apply" looks like for each topic.

### Proposed fix

Add 1-2 concrete examples per level:

```markdown
| Level        | Example Pattern                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| 0 Remember   | "What is X?" / "Which of these is the definition of X?"                                             |
| 1 Understand | "Why does X happen?" / "Explain the relationship between X and Y"                                   |
| 2 Apply      | "Given scenario S, what would X produce?" / "Calculate X given these values"                        |
| 3 Analyze    | "Compare X and Y: which properties differ?" / "What's wrong with this approach?"                    |
| 4 Evaluate   | "Is this conclusion valid given the evidence?" / "Which approach is better for scenario S and why?" |
| 5 Create     | "Design a system that solves X" / "Propose an alternative to Y"                                     |
```

---

## 14. Missing: guidance on question variety enforcement

### Problem

The instructions say "Check all previous question_text entries → generate a DIFFERENT question (vary the angle, not just wording)." But they don't explain HOW to vary the angle systematically.

When a card has been reviewed 5+ times, the AI runs out of angles quickly, especially for simple Remember-level concepts.

### Proposed fix

Add angle-variation strategies:

```markdown
### Question Variety Strategies

When checking previous question_text entries, vary along these
dimensions (pick a different one each time):

1. **Direction flip**: If previous asked "What is X?", ask
   "Which of these is NOT X?"
2. **Context shift**: Same concept, different scenario/domain
3. **Granularity change**: Ask about a specific detail instead of
   the whole concept, or vice versa
4. **Format change**: If previous was MCQ, use a calculation or
   ordering question
5. **Perspective shift**: Ask from the attacker's perspective,
   the user's perspective, the system's perspective
6. **Edge case focus**: Ask about boundary conditions or exceptions

If the card has 5+ reviews at the same Bloom level and you're
struggling to find new angles, consider escalating to the next
Bloom level even if the system hasn't promoted it yet (note this
in the review).
```

---

## Summary of proposed changes

| #   | Issue                                | Severity | Type                     |
| --- | ------------------------------------ | -------- | ------------------------ |
| 1   | Turn pipelining                      | Critical | New section              |
| 2   | Tool name mismatch                   | High     | Fix references           |
| 3   | Ambiguous optionShuffle              | High     | Rewrite with example     |
| 4   | Mid-quiz exploration                 | Medium   | New section              |
| 5   | "I don't know" handling              | Medium   | New section              |
| 6   | Session initialization               | Medium   | Add prominent note       |
| 7   | Open-response template contradiction | High     | Fix template or add note |
| 8   | "Web" modality unclear               | Low      | Add explanation          |
| 9   | Visual style redundancy              | Low      | Trim to reference        |
| 10  | Batch exhaustion                     | Medium   | Add guidance             |
| 11  | Edge case handling                   | Medium   | Add error handling       |
| 12  | 105-char limit buried                | High     | Make prominent           |
| 13  | Bloom table not actionable           | Low      | Add examples             |
| 14  | Question variety enforcement         | Medium   | Add strategies           |
