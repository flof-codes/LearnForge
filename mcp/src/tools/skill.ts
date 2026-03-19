import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Condensed skill knowledge — everything an LLM needs to drive LearnForge
// without a local skill file.
// ---------------------------------------------------------------------------

const INSTRUCTIONS = `# LearnForge — AI Tutor Instructions

You are a personal tutor powered by the LearnForge spaced repetition system.
You help the user learn through visual, interactive flashcards with Bloom's Taxonomy progression.

## Core Principles

1. **Active recall over passive review.** Always ask the user to produce an answer — never just show information.
2. **Spaced repetition respects the schedule.** Present due cards in FSRS order. Don't skip or revisit non-due cards unless the user asks.
3. **Bloom's progression = deeper understanding.** The same concept is revisited at increasing depth.
4. **Variety prevents memorization.** Rephrase every question. Change the angle. Use different scenarios. Never let the user memorize a pattern.
5. **Encourage thinking.** When the user is close but wrong, guide with Socratic questions rather than giving the answer.
6. **Visual first.** The user learns best with images, diagrams, and interactive elements. Text-only cards are never acceptable.

---

## Study Session Flow

When the user wants to study ("quiz me", "let's learn", etc.):

1. Call \`get_study_summary\` (optionally with topic_id) → present overview (total due, breakdown by topic, Bloom distribution).
2. Ask the user which topic and study mode:
   - **Chat** (default): AI asks open questions, user types answers, AI evaluates. Deepest learning — interval gets 1.2× boost. Pass modality="chat" to submit_review.
   - **MCQ only**: AI-generated multiple-choice at current Bloom level — interval boosted to 1.05×. Pass modality="mcq" to submit_review.
3. Call \`get_study_cards\` with topic_id and limit=5.
4. For each card:
   a. Read the concept, bloom_state.current_level, and review history.
   b. Check all previous question_text entries → generate a DIFFERENT question (vary the angle, not just wording).
   c. For Bloom levels 3-5: call \`get_similar_cards\` (limit=15) for cross-concept context.
   d. Generate question at the correct Bloom level (see Bloom Guide below).
   e. Present the question using the \`AskUserQuestion\` tool with one of these modes:
      - **multi_select** (DEFAULT — use this): Set multiSelect=true. Add "(Select all that apply)" to the question text. Evaluate: all correct + no wrong = rating 4, most correct = rating 3, some correct (>50%) = rating 2, fewer = rating 1.
      - **single_select**: Only for purely binary questions (yes/no, true/false) or when user explicitly asks. Set multiSelect=false.
      - **slider/calculation**: Present as single_select with numerical answer options.
      - **open_response**: Ask in normal chat text (user types free-form answer).
      - **MCQ option length limit:** The AskUserQuestion widget truncates options at 105 characters. When any MCQ option exceeds this limit, use the **letter-key pattern**: display the full options (A through E with complete text) in the chat message above the widget, then present only the short letter labels ("A", "B", "C", "D") as widget options. Never present truncated options — the user must always be able to read the full text.
      - **CRITICAL — Option order**: Each card from \`get_study_cards\` includes an \`optionShuffle\` array (e.g. [3, 1, 6, 2, 5, 4]) — a pre-randomized ordering of positions 1-6. You MUST use this array to place your options. Put your first option at position optionShuffle[0], second at optionShuffle[1], etc. This prevents LLM bias toward placing correct answers first. Do NOT ignore optionShuffle or override it with your own ordering.
   f. **Immediately** evaluate the response, assign rating 1-4, and call \`submit_review\` with:
      - \`question_text\`: the **exact, complete question** as shown to the user — including all MCQ options with letters (e.g. "Which of the following... A) option1 B) option2 C) option3 (Select all that apply)")
      - \`answer_expected\`: the correct/ideal answer (e.g. "A, C" for MCQ, or a full text answer for open response)
      - \`user_answer\`: the user's actual answer (e.g. "B, D" for MCQ, or the text they provided for open response)
      Do NOT batch reviews — submit after EACH card, not at the end of the session.
   g. Give feedback right away (2-4 sentences): what was right, what's missing, hint for next time.
   h. Report Bloom level changes and next due date before moving to the next card.

**When to use multi_select vs single_select:**
- **Default to multi_select** unless the user explicitly requests single_select or the question is purely binary (yes/no, true/false).
- Use single_select only for factual recall with one unambiguous answer (Remember level).
- Use multi_select for everything else: properties, products, characteristics, steps in a process, categories that apply. Especially powerful at Apply/Analyze levels where the user must distinguish which items belong and which don't.
- Always include at least 1-2 plausible distractors in multi_select questions.
- **Randomize option order**: correct answers must be distributed randomly across positions. Never cluster correct answers together or place them predictably (e.g. always first or last). Shuffle all options before presenting.
5. After all cards: summarize session (cards reviewed, accuracy, Bloom changes). Offer to create new cards.

---

## Card Creation Flow

Card creation is ALWAYS user-triggered ("create a card about X", "save as card").

1. Generate concept (1-2 sentences), front_html, and back_html.
2. Show preview to user by rendering the complete front_html and back_html visually (using the Visualizer, artifact, or equivalent rendering tool) — NEVER describe cards in prose. The user must see the actual rendered card, not a text summary. NEVER save without approval.
3. Wait for user confirmation or change requests.
4. Only after approval: call \`create_card\`.

### Front Side Rules
- The front asks the QUESTION only. It must NOT reveal the answer.
- NO sliders, NO interactive diagrams, NO formula displays on the front.
- Keep it clean: term/concept + question.
- NO input fields, NO textareas, NO submit buttons on the front. The front is a static question prompt only — answering happens in chat during study sessions.
- Choose template: mcq (multi-select), label-diagram, open-response, or simple styled question.

### Back Side Rules
- Always use the visual-explain template (progressive reveal accordion).
- 2-5 collapsible sections that build understanding step by step.
- Key terms in \`<span class="lf-highlight">term</span>\`.
- Formulas with KaTeX (NEVER use <sup>/<sub> HTML hacks).
- Diagrams (SVG, bar charts) when concept involves varying values.
- Optional interactive elements (sliders) for exploration.
- For MCQ cards: structure the back as one accordion section per option. Each section header shows the option letter + text. Each body explains WHY it is correct or wrong, with key terms highlighted.

---

## Bloom's Taxonomy Question Guide

| Level | Name       | Stems                                          | Card Types              |
|-------|------------|------------------------------------------------|-------------------------|
| 0     | Remember   | What is…? Name… Which… Define…                | multi_select, label diagram |
| 1     | Understand | Explain why… Describe how… Summarize…         | open_response, multi_select |
| 2     | Apply      | Given this scenario… Calculate… Predict…       | slider, multi_select     |
| 3     | Analyze    | Compare… How does X differ from Y…            | Open response, comparative|
| 4     | Evaluate   | Is this conclusion valid… Which is better…     | Open response + data     |
| 5     | Create     | Design… Propose… How would you build…          | Open response            |

- For levels 3+: use \`get_similar_cards\` to craft cross-concept questions.
- Not every card reaches level 5. Recognize when a concept plateaus.
- The MCP server handles Bloom transitions: correct (rating ≥ 3) → move up; wrong (rating ≤ 2) → move down. FSRS handles scheduling independently.

---

## Response Evaluation Guide

### Rating Scale
- **1 (Again):** Wrong or completely missed the point.
- **2 (Hard):** Partially correct or correct with significant gaps.
- **3 (Good):** Correct with adequate depth for the Bloom level. Standard pass.
- **4 (Easy):** Excellent, exceeds expectations. Deep understanding.

### By Card Type
- **single_select:** Deterministic — correct → 3-4, wrong → 1.
- **multi_select:** Score by precision and recall. All correct selected + no wrong selected → 4. All correct selected + 1 wrong → 3. Most correct (>50%) → 2. Fewer → 1.
- **Label / Slider:** Deterministic — all correct → 3-4. Most correct (>75%) → 2. Less → 1.
- **Open Response:** AI-evaluated per Bloom level:
  - Remember: correct fact? Binary.
  - Understand: explains correctly in own words? No misconceptions?
  - Apply: correctly applies concept to scenario?
  - Analyze: valid connections, 2+ comparison points?
  - Evaluate: justified judgment with evidence?
  - Create: original, viable, logical proposal?

### Feedback Style
- Start with what was correct (even in wrong answers).
- Be specific about gaps ("you didn't mention the proton gradient").
- End with a learning nudge for next time.
- 2-4 sentences. Match tone to rating.

---

## Visual Style (Dark Theme)

- Background: #111827
- Text: #e0e4ef
- Muted text: #94a3b8
- Accent green: #6ee7b7
- Accent blue: #3b82f6
- Accent purple: #a5b4fc
- Borders: #1e2940
- Dark surface: #0f172a
- All CSS classes prefixed with \`lf-\` (e.g. lf-card, lf-bloom-tag, lf-highlight)

### Formulas (MANDATORY)
Use KaTeX from CDN — never HTML hacks:
\`\`\`
CDN: https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/
Delimiters: $$...$$
Call: renderMathInElement(document.body, { delimiters: [{left: '$$', right: '$$', display: false}], throwOnError: false })
KaTeX color in dark theme: .katex { color: #93c5fd; }
\`\`\`

### SVG Diagrams
- Use the dark color scheme for strokes/fills.
- viewBox: 400-600 width, 150-250 height.
- Label parts with <text>, connect with leader lines.
- Keep it focused on the key structures.

---

## Tool Quick Reference

| Action | Tool | Key Parameters |
|--------|------|----------------|
| Study summary | get_study_summary | topic_id? |
| Due cards | get_study_cards | topic_id?, limit? |
| Submit review | submit_review | card_id, bloom_level, rating, question_text, modality?, answer_expected? |
| Create card | create_card | topic_id, concept, front_html, back_html, tags? |
| Get card | get_card | card_id |
| Update card | update_card | card_id, + partial fields |
| Delete card | delete_card | card_id |
| List topics | list_topics | — |
| Create topic | create_topic | name, description?, parent_id? |
| Topic tree | get_topic_tree | topic_id |
| Update topic | update_topic | topic_id, name?, description?, parent_id? |
| Delete topic | delete_topic | topic_id |
| Similar cards | get_similar_cards | card_id, limit? |
| Topic context | get_topic_context | topic_id, depth? |
| Upload image | upload_image | file_path, card_id? |
| Delete image | delete_image | image_id |
| Get instructions | get_instructions | — |
| Get templates | get_templates | template_name? |
`;

// ---------------------------------------------------------------------------
// HTML Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, { description: string; variables: string; html: string }> = {
  mcq: {
    description: "Multiple choice question — multi-select with letter badges and check button. Front side: user selects all correct answers, clicks Check. Pair with a back side that explains why each option is correct or wrong.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}} (e.g. 'Remember'), {{QUESTION}}, {{CONTEXT}} (optional), {{OPTIONS}} (array of {letter, text, correct}), {{FEEDBACK}}",
    html: `<div class="lf-card lf-mcq">
  <style>
    .lf-card { font-family: 'Segoe UI', system-ui, sans-serif; background: #111827; color: #e0e4ef; padding: 24px; border-radius: 14px; max-width: 650px; }
    .lf-bloom-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .lf-bloom-0 { background: #052e16; color: #6ee7b7; }
    .lf-bloom-1 { background: #083344; color: #67e8f9; }
    .lf-bloom-2 { background: #1e1b4b; color: #a5b4fc; }
    .lf-bloom-3 { background: #312e81; color: #c4b5fd; }
    .lf-bloom-4 { background: #4c1d95; color: #ddd6fe; }
    .lf-bloom-5 { background: #581c87; color: #e9d5ff; }
    .lf-context { font-size: 0.85em; color: #94a3b8; margin-bottom: 14px; padding: 10px 14px; background: #0a0e1a; border-radius: 8px; border-left: 3px solid #3b82f6; }
    .lf-question { font-size: 1.05em; line-height: 1.6; margin-bottom: 6px; }
    .lf-hint { font-size: 0.82em; color: #6b7fa8; margin-bottom: 14px; }
    .lf-opt { padding: 12px 16px; margin: 8px 0; border-radius: 10px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 12px; background: #1e293b; border: 1px solid #2d3754; }
    .lf-opt:hover { border-color: #3b82f6; background: #1e3a5f; }
    .lf-opt .lf-letter { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85em; flex-shrink: 0; background: #2d3754; color: #94a3b8; }
    .lf-opt .lf-opt-text { font-size: 0.92em; line-height: 1.4; }
    .lf-opt .lf-check { width: 20px; height: 20px; border-radius: 4px; border: 2px solid #4b5563; margin-left: auto; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.75em; transition: all 0.2s; }
    .lf-opt.lf-selected { border-color: #3b82f6; background: #1e3a5f; }
    .lf-opt.lf-selected .lf-check { border-color: #3b82f6; background: #3b82f6; color: white; }
    .lf-opt.lf-correct { border-color: #059669; background: #052e16; }
    .lf-opt.lf-correct .lf-letter { background: #059669; color: white; }
    .lf-opt.lf-correct .lf-check { border-color: #059669; background: #059669; color: white; }
    .lf-opt.lf-wrong { border-color: #dc2626; background: #450a0a; }
    .lf-opt.lf-wrong .lf-letter { background: #dc2626; color: white; }
    .lf-opt.lf-wrong .lf-check { border-color: #dc2626; background: #dc2626; color: white; }
    .lf-opt.lf-missed { border-color: #d97706; background: #451a03; opacity: 0.7; }
    .lf-opt.lf-missed .lf-letter { background: #d97706; color: white; }
    .lf-opt.lf-disabled { pointer-events: none; }
    .lf-check-btn { margin-top: 14px; padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9em; font-weight: 600; background: #3b82f6; color: white; transition: all 0.2s; }
    .lf-check-btn:hover { background: #2563eb; }
    .lf-check-btn:disabled { opacity: 0.5; cursor: default; }
    .lf-feedback { margin-top: 14px; padding: 14px 16px; border-radius: 10px; font-size: 0.88em; line-height: 1.6; display: none; }
    .lf-fb-perfect { display: block; background: #052e16; border: 1px solid #059669; color: #6ee7b7; }
    .lf-fb-partial { display: block; background: #451a03; border: 1px solid #d97706; color: #fcd34d; }
    .lf-fb-wrong { display: block; background: #450a0a; border: 1px solid #dc2626; color: #fca5a5; }
  </style>

  <div class="lf-bloom-tag lf-bloom-{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</div>
  <!-- Optional: <div class="lf-context">{{CONTEXT}}</div> -->
  <div class="lf-question">{{QUESTION}}</div>
  <div class="lf-hint">Select all that apply</div>

  <!-- Replace with actual options -->
  <div class="lf-opt" onclick="lfMcqToggle(this)" data-correct="true">
    <div class="lf-letter">A</div>
    <div class="lf-opt-text">Option A text</div>
    <div class="lf-check"></div>
  </div>
  <div class="lf-opt" onclick="lfMcqToggle(this)" data-correct="false">
    <div class="lf-letter">B</div>
    <div class="lf-opt-text">Option B text</div>
    <div class="lf-check"></div>
  </div>

  <button class="lf-check-btn" onclick="lfMcqCheck()">Check Answers</button>
  <div class="lf-feedback" id="lf-mcq-fb"></div>

  <script>
    function lfMcqToggle(el) {
      if (el.classList.contains('lf-disabled')) return;
      el.classList.toggle('lf-selected');
      el.querySelector('.lf-check').textContent = el.classList.contains('lf-selected') ? '\\u2713' : '';
    }
    function lfMcqCheck() {
      const card = document.querySelector('.lf-mcq');
      const opts = card.querySelectorAll('.lf-opt');
      const btn = card.querySelector('.lf-check-btn');
      btn.disabled = true;
      btn.textContent = 'Checked';
      let correct = 0, total = 0, wrong = 0;
      opts.forEach(o => {
        o.classList.add('lf-disabled');
        const isCorrect = o.dataset.correct === 'true';
        const isSelected = o.classList.contains('lf-selected');
        if (isCorrect) total++;
        if (isCorrect && isSelected) { o.classList.add('lf-correct'); correct++; }
        else if (isCorrect && !isSelected) { o.classList.add('lf-missed'); }
        else if (!isCorrect && isSelected) { o.classList.add('lf-wrong'); wrong++; }
      });
      const fb = card.querySelector('#lf-mcq-fb');
      if (correct === total && wrong === 0) {
        fb.className = 'lf-feedback lf-fb-perfect';
        fb.textContent = '{{FEEDBACK}}';
      } else if (correct > 0) {
        fb.className = 'lf-feedback lf-fb-partial';
        fb.textContent = correct + ' of ' + total + ' correct' + (wrong > 0 ? ', ' + wrong + ' wrong' : '') + '. Flip the card for explanations.';
      } else {
        fb.className = 'lf-feedback lf-fb-wrong';
        fb.textContent = 'None correct. Flip the card for explanations.';
      }
    }
  </script>
</div>`,
  },

  "open-response": {
    description: "Framed text input with submit button. Use for Understand+ level front sides where the answer requires explanation.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{CONTEXT}} (optional), {{PLACEHOLDER}}",
    html: `<div class="lf-card lf-open">
  <style>
    .lf-card { font-family: 'Segoe UI', system-ui, sans-serif; background: #111827; color: #e0e4ef; padding: 24px; border-radius: 14px; max-width: 650px; }
    .lf-bloom-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .lf-bloom-0 { background: #052e16; color: #6ee7b7; }
    .lf-bloom-1 { background: #083344; color: #67e8f9; }
    .lf-bloom-2 { background: #1e1b4b; color: #a5b4fc; }
    .lf-bloom-3 { background: #312e81; color: #c4b5fd; }
    .lf-bloom-4 { background: #4c1d95; color: #ddd6fe; }
    .lf-bloom-5 { background: #581c87; color: #e9d5ff; }
    .lf-context { font-size: 0.85em; color: #94a3b8; margin-bottom: 14px; padding: 10px 14px; background: #0a0e1a; border-radius: 8px; border-left: 3px solid #3b82f6; }
    .lf-question { font-size: 1.05em; line-height: 1.6; margin-bottom: 16px; }
    .lf-textarea { width: 100%; background: #0f172a; border-radius: 10px; border: 1px solid #2d3754; padding: 14px; font-family: inherit; font-size: 0.92em; color: #e0e4ef; resize: vertical; min-height: 100px; box-sizing: border-box; }
    .lf-textarea::placeholder { color: #4b5563; }
    .lf-textarea:focus { outline: none; border-color: #3b82f6; }
    .lf-submit { margin-top: 12px; padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9em; font-weight: 600; background: #3b82f6; color: white; transition: all 0.2s; }
    .lf-submit:hover { background: #2563eb; }
    .lf-submit:disabled { opacity: 0.5; cursor: default; }
    .lf-feedback { margin-top: 14px; padding: 14px 16px; border-radius: 10px; font-size: 0.88em; line-height: 1.6; display: none; }
    .lf-fb-show { display: block; background: #0f172a; border: 1px solid #1e2940; color: #b0b8d0; }
  </style>

  <div class="lf-bloom-tag lf-bloom-{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</div>
  <div class="lf-context">{{CONTEXT}}</div>
  <div class="lf-question">{{QUESTION}}</div>
  <textarea class="lf-textarea" id="lf-open-input" placeholder="{{PLACEHOLDER}}"></textarea>
  <button class="lf-submit" onclick="lfOpenSubmit()">Check Answer</button>
  <div class="lf-feedback" id="lf-open-fb"></div>

  <script>
    function lfOpenSubmit() {
      const input = document.getElementById('lf-open-input');
      const fb = document.getElementById('lf-open-fb');
      const btn = document.querySelector('.lf-submit');
      if (!input.value.trim()) return;
      btn.disabled = true;
      btn.textContent = 'Submitted';
      fb.className = 'lf-feedback lf-fb-show';
      fb.textContent = 'Your response has been submitted. Claude will evaluate it and provide feedback.';
    }
  </script>
</div>`,
  },

  "visual-explain": {
    description: "Progressive reveal accordion — ALWAYS used for the back side of cards. Structure explanations as 2-5 collapsible sections building understanding step by step.",
    variables: "{{TITLE}}, {{SECTIONS}} (array of {header, body} — body can contain lf-highlight spans, KaTeX formulas, SVG diagrams)",
    html: `<div class="lf-card lf-visual">
  <style>
    .lf-card { font-family: 'Segoe UI', system-ui, sans-serif; background: #111827; color: #e0e4ef; padding: 24px; border-radius: 14px; max-width: 650px; }
    .lf-vis-title { font-size: 1.15em; font-weight: 700; margin-bottom: 14px; }
    .lf-vis-intro { font-size: 0.85em; color: #6b7fa8; margin-bottom: 14px; }
    .lf-acc-item { margin: 8px 0; border-radius: 10px; overflow: hidden; border: 1px solid #1e2940; }
    .lf-acc-header { padding: 12px 16px; background: #0f172a; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.92em; font-weight: 600; transition: all 0.2s; user-select: none; }
    .lf-acc-header:hover { background: #1e293b; }
    .lf-acc-arrow { transition: transform 0.25s; color: #6b7fa8; font-size: 0.8em; }
    .lf-acc-body { max-height: 0; overflow: hidden; transition: max-height 0.35s ease, padding 0.35s; background: #111827; }
    .lf-acc-body-inner { padding: 0 16px; }
    .lf-acc-item.lf-open .lf-acc-body { max-height: 500px; }
    .lf-acc-item.lf-open .lf-acc-body .lf-acc-body-inner { padding: 14px 16px; }
    .lf-acc-item.lf-open .lf-acc-arrow { transform: rotate(90deg); }
    .lf-acc-body p { font-size: 0.88em; color: #b0b8d0; line-height: 1.65; margin: 0; }
    .lf-acc-body .lf-highlight { color: #6ee7b7; font-weight: 600; }
    .lf-acc-body .lf-formula { display: inline-block; padding: 2px 8px; background: #0a0e1a; border-radius: 4px; font-family: 'Fira Code', monospace; color: #93c5fd; font-size: 0.9em; }
    .lf-acc-body svg { width: 100%; max-height: 160px; margin: 10px 0; }
    .lf-back-label { font-size: 0.72em; color: #4b5563; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .lf-formula-block { text-align: center; margin: 16px 0; padding: 18px; background: #0a0e1a; border-radius: 10px; border: 1px solid #1e2940; }
    .lf-card .katex { color: #93c5fd; font-size: 1.1em; }
    .lf-formula-block .katex { font-size: 1.4em; }
  </style>

  <div class="lf-back-label">Answer / Explanation</div>
  <div class="lf-vis-title">{{TITLE}}</div>
  <div class="lf-vis-intro">Click each section to reveal:</div>

  <!-- Replace with topic-specific sections -->
  <div class="lf-acc-item" onclick="lfToggleAcc(this)">
    <div class="lf-acc-header"><span>1. Section Title</span><span class="lf-acc-arrow">&#9654;</span></div>
    <div class="lf-acc-body"><div class="lf-acc-body-inner"><p>Section content with <span class="lf-highlight">key terms</span> highlighted.</p></div></div>
  </div>

  <script>
    function lfToggleAcc(item) { item.classList.toggle('lf-open'); }
  </script>
</div>`,
  },

  "label-diagram": {
    description: "Drag-and-drop label placement on SVG diagrams. Use for Remember level front sides where the concept involves spatial relationships or identifying parts.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{SVG_DIAGRAM}} (inline SVG with foreignObject drop zones), {{LABELS}} (array of {label, text})",
    html: `<div class="lf-card lf-label">
  <style>
    .lf-card { font-family: 'Segoe UI', system-ui, sans-serif; background: #111827; color: #e0e4ef; padding: 24px; border-radius: 14px; max-width: 650px; }
    .lf-bloom-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .lf-bloom-0 { background: #052e16; color: #6ee7b7; }
    .lf-bloom-1 { background: #083344; color: #67e8f9; }
    .lf-bloom-2 { background: #1e1b4b; color: #a5b4fc; }
    .lf-question { font-size: 1.05em; line-height: 1.6; margin-bottom: 16px; }
    .lf-diagram-area { position: relative; background: #0a0e1a; border-radius: 12px; padding: 16px; border: 1px solid #1e2940; }
    .lf-diagram-area svg { width: 100%; max-height: 260px; display: block; }
    .lf-drop-zone { display: inline-flex; align-items: center; justify-content: center; min-width: 90px; min-height: 28px; padding: 4px 10px; border: 2px solid #1e2940; color: #4b5563; background: #0f172a; border-radius: 6px; font-size: 0.8em; transition: all 0.2s; cursor: default; }
    .lf-drop-zone.lf-drag-over { border-color: #a78bfa; background: rgba(167,139,250,0.08); }
    .lf-drop-zone.lf-filled { border-color: #8b5cf6; color: #c4b5fd; background: #1e1b4b; font-weight: 600; }
    .lf-drop-zone.lf-correct { border-color: #059669; color: #6ee7b7; background: #052e16; }
    .lf-drop-zone.lf-wrong { border-color: #dc2626; color: #fca5a5; background: #450a0a; }
    .lf-label-bank { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid #1e2940; }
    .lf-label-chip { padding: 6px 14px; border-radius: 6px; font-size: 0.82em; font-weight: 600; cursor: grab; user-select: none; transition: all 0.15s; background: linear-gradient(135deg, #4338ca, #6366f1); color: white; }
    .lf-label-chip:active { cursor: grabbing; transform: scale(0.95); opacity: 0.8; }
    .lf-label-chip.lf-placed { opacity: 0.25; cursor: default; pointer-events: none; }
    .lf-check-btn { margin-top: 14px; padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 0.9em; font-weight: 600; background: #3b82f6; color: white; transition: all 0.2s; }
    .lf-check-btn:hover { background: #2563eb; }
    .lf-feedback { margin-top: 14px; padding: 14px 16px; border-radius: 10px; font-size: 0.88em; line-height: 1.6; display: none; }
    .lf-fb-correct { display: block; background: #052e16; border: 1px solid #059669; color: #6ee7b7; }
    .lf-fb-partial { display: block; background: #451a03; border: 1px solid #d97706; color: #fcd34d; }
  </style>

  <div class="lf-bloom-tag lf-bloom-{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</div>
  <div class="lf-question">{{QUESTION}}</div>

  <div class="lf-diagram-area">
    <!-- Replace SVG and drop zones with topic-specific diagram -->
    <svg viewBox="0 0 460 180" xmlns="http://www.w3.org/2000/svg">
      <!-- SVG content with foreignObject drop zones using data-answer attributes -->
    </svg>
    <div class="lf-label-bank">
      <!-- Label chips with data-label and draggable="true" -->
    </div>
  </div>

  <button class="lf-check-btn" onclick="lfCheckLabels()">Check Answers</button>
  <div class="lf-feedback" id="lf-label-fb"></div>

  <script>
    function lfDragStart(e) { e.dataTransfer.setData('text/plain', e.target.dataset.label); e.dataTransfer.effectAllowed = 'move'; }
    function lfDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    function lfDragEnter(e) { e.preventDefault(); e.target.classList.add('lf-drag-over'); }
    function lfDragLeave(e) { e.target.classList.remove('lf-drag-over'); }
    function lfDrop(e) {
      e.preventDefault();
      const zone = e.target.closest('.lf-drop-zone');
      if (!zone || zone.classList.contains('lf-filled')) return;
      zone.classList.remove('lf-drag-over');
      const label = e.dataTransfer.getData('text/plain');
      const chip = document.querySelector('.lf-label-chip[data-label="' + label + '"]');
      if (!chip || chip.classList.contains('lf-placed')) return;
      zone.textContent = chip.textContent;
      zone.dataset.placed = label;
      zone.classList.add('lf-filled');
      chip.classList.add('lf-placed');
      chip.draggable = false;
    }
    function lfCheckLabels() {
      const zones = document.querySelectorAll('.lf-drop-zone');
      let correct = 0, total = zones.length;
      zones.forEach(z => {
        if (z.dataset.placed === z.dataset.answer) { z.classList.add('lf-correct'); correct++; }
        else if (z.dataset.placed) { z.classList.add('lf-wrong'); }
      });
      const fb = document.getElementById('lf-label-fb');
      fb.className = 'lf-feedback ' + (correct === total ? 'lf-fb-correct' : 'lf-fb-partial');
      fb.textContent = correct === total ? 'All ' + total + ' labels correct!' : correct + ' of ' + total + ' correct. Review the highlighted zones.';
    }
  </script>
</div>`,
  },

  slider: {
    description: "Clean blue sliders for value manipulation. Use for BACK SIDE or Apply+ level Bloom questions. NOT for initial front_html.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{SLIDERS}} (array of {name, label, unit, min, max, default, step?}), {{FORMULA}} (JS function), {{TARGET_VALUE}}, {{TARGET_UNIT}}, {{TARGET_TOLERANCE}}",
    html: `<div class="lf-card lf-slider">
  <style>
    .lf-card { font-family: 'Segoe UI', system-ui, sans-serif; background: #111827; color: #e0e4ef; padding: 24px; border-radius: 14px; max-width: 650px; }
    .lf-bloom-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .lf-bloom-0 { background: #052e16; color: #6ee7b7; }
    .lf-bloom-1 { background: #083344; color: #67e8f9; }
    .lf-bloom-2 { background: #1e1b4b; color: #a5b4fc; }
    .lf-bloom-3 { background: #312e81; color: #c4b5fd; }
    .lf-bloom-4 { background: #4c1d95; color: #ddd6fe; }
    .lf-bloom-5 { background: #581c87; color: #e9d5ff; }
    .lf-question { font-size: 1.05em; line-height: 1.6; margin-bottom: 16px; }
    .lf-question strong { color: #3b82f6; }
    .lf-slider-group { margin: 16px 0; }
    .lf-slider-group label { display: flex; justify-content: space-between; font-size: 0.88em; margin-bottom: 6px; }
    .lf-slider-group label span:first-child { color: #94a3b8; }
    .lf-slider-group label span:last-child { font-weight: 700; color: #3b82f6; min-width: 60px; text-align: right; }
    .lf-slider-group input[type=range] { width: 100%; height: 6px; -webkit-appearance: none; border-radius: 3px; outline: none; background: #1e2940; }
    .lf-slider-group input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; background: #3b82f6; border: 2px solid #60a5fa; }
    .lf-result { text-align: center; margin: 20px 0; padding: 18px; border-radius: 12px; background: #0f172a; border: 1px solid #1e2940; }
    .lf-result-val { font-size: 2.2em; font-weight: 800; color: #3b82f6; }
    .lf-result-label { font-size: 0.82em; color: #6b7fa8; margin-top: 4px; }
    .lf-result-target { font-size: 0.85em; margin-top: 10px; padding: 6px 16px; border-radius: 20px; display: inline-block; font-weight: 600; transition: all 0.3s; }
    .lf-target-hit { background: #052e16; color: #6ee7b7; }
    .lf-target-close { background: #451a03; color: #fcd34d; }
    .lf-target-far { background: #450a0a; color: #fca5a5; }
    .lf-formula { margin-top: 8px; font-family: 'Fira Code', monospace; font-size: 0.82em; color: #6b7fa8; }
  </style>

  <div class="lf-bloom-tag lf-bloom-{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</div>
  <div class="lf-question">{{QUESTION}}</div>

  <!-- Replace with topic-specific sliders -->
  <div class="lf-slider-group">
    <label><span>Variable</span><span id="lf-sv-variable">0</span></label>
    <input type="range" min="0" max="100" value="50" step="1" data-name="variable" data-unit="" oninput="lfSliderUpdate()">
  </div>

  <div class="lf-result">
    <div class="lf-result-val" id="lf-result-val">0</div>
    <div class="lf-result-label" id="lf-result-label">Result</div>
    <div class="lf-formula">formula</div>
    <div class="lf-result-target" id="lf-result-target">Target: 0</div>
  </div>

  <script>
    const lfSliderConfig = {
      formula: (vars) => vars.variable,
      targetValue: 50,
      targetTolerance: 2,
      resultUnit: '',
      resultLabel: 'Result'
    };
    function lfSliderUpdate() {
      const sliders = document.querySelectorAll('.lf-slider input[type=range]');
      const vars = {};
      sliders.forEach(s => {
        vars[s.dataset.name] = parseFloat(s.value);
        document.getElementById('lf-sv-' + s.dataset.name).textContent = s.value + ' ' + s.dataset.unit;
      });
      const result = lfSliderConfig.formula(vars);
      document.getElementById('lf-result-val').textContent = result.toFixed(2) + ' ' + lfSliderConfig.resultUnit;
      const diff = Math.abs(result - lfSliderConfig.targetValue);
      const target = document.getElementById('lf-result-target');
      if (diff <= lfSliderConfig.targetTolerance) {
        target.className = 'lf-result-target lf-target-hit';
        target.textContent = 'Target reached!';
      } else if (diff < 0.15 * lfSliderConfig.targetValue) {
        target.className = 'lf-result-target lf-target-close';
        target.textContent = 'Getting close... Target: ' + lfSliderConfig.targetValue.toFixed(2) + ' ' + lfSliderConfig.resultUnit;
      } else {
        target.className = 'lf-result-target lf-target-far';
        target.textContent = 'Keep adjusting... Target: ' + lfSliderConfig.targetValue.toFixed(2) + ' ' + lfSliderConfig.resultUnit;
      }
    }
  </script>
</div>`,
  },
};

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerSkillTools(server: McpServer) {
  server.tool(
    "get_instructions",
    "Get the complete LearnForge tutor instructions: study session flow, card creation rules, Bloom's question guide, evaluation criteria, visual style specs, and pedagogical principles. Call this at the start of any session to learn how to operate as a LearnForge tutor.",
    {},
    async () => {
      return {
        content: [{ type: "text" as const, text: INSTRUCTIONS }],
      };
    },
  );

  server.tool(
    "get_templates",
    "Get HTML card templates for LearnForge. Returns template HTML with variable placeholders, CSS, and JS. Use when creating or updating cards. Pass a template_name to get one specific template, or omit to get all five.",
    {
      template_name: z
        .enum(["mcq", "open-response", "visual-explain", "label-diagram", "slider"])
        .optional()
        .describe(
          "Specific template to retrieve. Options: mcq, open-response, visual-explain, label-diagram, slider. Omit to get all templates.",
        ),
    },
    async ({ template_name }) => {
      if (template_name) {
        const t = TEMPLATES[template_name];
        if (!t) {
          return {
            content: [{ type: "text" as const, text: `Unknown template: ${template_name}. Available: ${Object.keys(TEMPLATES).join(", ")}` }],
            isError: true,
          };
        }
        const result = {
          name: template_name,
          description: t.description,
          variables: t.variables,
          html: t.html,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      // Return all templates
      const all = Object.entries(TEMPLATES).map(([name, t]) => ({
        name,
        description: t.description,
        variables: t.variables,
        html: t.html,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(all, null, 2) }] };
    },
  );
}
