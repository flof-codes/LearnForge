---
name: compile-glasses
description: Compile due LearnForge cards into glasses-sized multiple-choice questions for the Even Realities G2, through the LearnForge MCP connector. Use when Florian says "compile glasses", "prepare the glasses", "fill the glasses queue", or before a G2 study session. Admin only; runs on the Max subscription in Claude Code, never on the server.
---

# Compile glasses questions

The G2 glasses show one fixed-font screen (about 48 characters per line, 10 lines) and take answers from the R1 ring. They never call Claude. This skill fills their question cache ahead of a session.

## Preconditions

- The **LearnForge MCP connector** (learnforge.eu/mcp, OAuth or API key) is connected in this Claude Code session. Do not use a local stdio MCP: it points at a different database.
- The account is an admin. The tools refuse otherwise.

## Steps

1. Call `get_instructions` once and read the section **Glasses Compile Flow**. It holds the caps and the per-level rules.
2. Call `get_glasses_compile_queue` with `limit: 10` (and `topic_id` if Florian named a topic, `horizon_days` if he said how far ahead).
3. For every entry, write one question that fits the caps and call `store_glasses_question`:
   - `stem` ≤ 96 chars, 2 lines; `options` exactly 4 × ≤ 28 chars; `correct` zero-based indices; `explanation` ≤ 190 chars.
   - Latin text only. No formulas, HTML, arrows, ticks or emoji.
   - `changeRate` 0: copy the original question and options word for word.
   - Prefer one correct option. Use two or three only when the card asks for a set.
   - When the card cannot be compressed (formula, diagram, image-dependent), call `store_glasses_question` with `skip: true` and a one-sentence `reason`.
4. Repeat from step 2 until the queue is empty or Florian's limit is reached. Default stop: 30 cards per run.
5. Report in three lines: stored, skipped (with reasons), left in queue. No card content in the report unless asked.

## Never

- Ask the learner questions or start a study session while compiling.
- Store a question that failed validation by shortening it into nonsense. Skip it with a reason instead.
- Call `submit_review`.
