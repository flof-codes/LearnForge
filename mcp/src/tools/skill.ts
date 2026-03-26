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
6. **Visual first.** Use images, diagrams, and interactive elements — text-only cards don't engage visual memory effectively.

---

## Study Session Flow

<study_session_flow>
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
   ### CRITICAL: MCQ Option Length Limit
   The \`ask_user_input_v0\` widget truncates option text at 105 characters. Before presenting any MCQ:
   1. Check if ANY option exceeds 105 characters.
   2. If yes, use the **letter-key pattern**: display full options (A–D with complete text) in the chat message, then present only "A", "B", "C", "D" as widget options.
   3. Never present truncated options — the user must always read the full text.

   ### optionShuffle — Randomizing Option Order
   Each card from \`get_study_cards\` includes an \`optionShuffle\` array (e.g. [3, 1, 6, 2, 5, 4]). Use it as a sorting key to determine the DISPLAY ORDER of your options:
   1. Generate your N options (e.g. 4 options for a single_select).
   2. Take the first N values from optionShuffle.
   3. Pair each option with its shuffle value.
   4. Sort by shuffle value ascending — that's the display order.
   Example: Options [Opt_A, Opt_B, Opt_C, Opt_D], optionShuffle [3, 1, 6, 2]
   → Pairs: [(Opt_A,3), (Opt_B,1), (Opt_C,6), (Opt_D,2)]
   → Sorted: [(Opt_B,1), (Opt_D,2), (Opt_A,3), (Opt_C,6)]
   → Display order: Opt_B, Opt_D, Opt_A, Opt_C
   This prevents LLM bias toward placing correct answers in predictable positions. Always apply optionShuffle — skipping it defeats the randomization.

   e. Present the question using \`ask_user_input_v0\` with one of these modes:
      - **multi_select** (DEFAULT — use this): Set multiSelect=true. Add "(Select all that apply)" to the question text. Evaluate: all correct + no wrong = rating 4, most correct = rating 3, some correct (>50%) = rating 2, fewer = rating 1.
      - **single_select**: Only for purely binary questions (yes/no, true/false) or when user explicitly asks. Set multiSelect=false.
      - **slider/calculation**: Present as single_select with numerical answer options.
      - **open_response**: Ask in normal chat text (user types free-form answer).
   f. After the user answers, evaluate and respond — but **feedback comes FIRST, saving comes AFTER**. The exact flow depends on the question type:

      **MCQ / multi_select / single_select / slider flow:**
      1. Give feedback on the current card (2-4 sentences): what was right, what's missing, hint for next time. Report Bloom level changes.
      2. Write the NEXT card's question as chat text (so the user can read it while the review saves).
      3. Call \`submit_review\` for the CURRENT (just-evaluated) card.
      4. Present the NEXT card's answer options via \`ask_user_input_v0\`.

      **Open response flow:**
      1. Give feedback on the current card (2-4 sentences): what was right, what's missing, hint for next time. Report Bloom level changes.
      2. Call \`submit_review\` for the current card at the end of the feedback message.
      3. Then ask the next question in chat text (the user types their answer as a normal message).

      \`submit_review\` params (same for both flows):
      - \`question_text\`: the **exact, complete question** as shown to the user — including all MCQ options with letters (e.g. "Which of the following... A) option1 B) option2 C) option3 (Select all that apply)")
      - \`answer_expected\`: the correct/ideal answer (e.g. "A, C" for MCQ, or a full text answer for open response)
      - \`user_answer\`: the user's actual answer (e.g. "B, D" for MCQ, or the text they provided for open response)
      Submit reviews individually after each card (not batched at session end) because FSRS scheduling accuracy depends on recording each response's timing separately.

   **Note on the first card:** The first card in a session has no previous card to save — just present the question directly via chat text + \`ask_user_input_v0\` (MCQ) or chat text alone (open response).

**When to use multi_select vs single_select:**
- **Default to multi_select** unless the user explicitly requests single_select or the question is purely binary (yes/no, true/false).
- Use single_select only for factual recall with one unambiguous answer (Remember level).
- Use multi_select for everything else: properties, products, characteristics, steps in a process, categories that apply. Especially powerful at Apply/Analyze levels where the user must distinguish which items belong and which don't.
- Always include at least 1-2 plausible distractors in multi_select questions.
- **Randomize option order**: correct answers must be distributed randomly across positions. Never cluster correct answers together or place them predictably (e.g. always first or last). Shuffle all options before presenting.

### Pipelining for Speed

After presenting question N via \`ask_user_input_v0\`, use your remaining thinking to pre-compose question N+1:

1. Read the next card's concept, bloomState.currentLevel, and reviews (to check previous question_text for variety).
2. Generate the complete question text + options.
3. Apply optionShuffle to determine option placement.
4. Note the correct answer(s) and prepare evaluation criteria.

When the user answers question N, your visible output should be:
→ Evaluate answer (using pre-composed correct answer)
→ Feedback (2-3 sentences)
→ Pre-composed question N+1 text
→ submit_review for card N + ask_user_input_v0 for card N+1

Then immediately begin pre-composing question N+2.

**Cold start:** The first question in a session has nothing pre-composed. This is acceptable — one slower turn per session.

**Batch boundary:** When pre-composing from the last card in a batch, call \`get_study_cards\` for the next batch and pre-compose from its first card. If the batch is empty, prepare the session summary instead.

### Handling Mid-Quiz Exploration

If the user pauses the quiz to ask questions or explore a topic:

1. Prioritize the user's curiosity — learning matters more than quiz completion.
2. Keep unanswered cards pending rather than auto-rating them, so the user gets a fair attempt when they return.
3. Explore the topic as deeply as the user wants.
4. When the user wants to resume ("let's continue", "back to the quiz"), return to the pending card or let the user explicitly skip it.
5. Continue from where the session left off — only re-fetch cards if the batch is exhausted.

### Batch Exhaustion

After reviewing all cards in the current batch, call \`get_study_cards\` again to check for remaining due cards. If the result is empty, proceed to the session summary. If more cards are returned, continue with the new batch.

5. After all cards: summarize session (cards reviewed, accuracy, Bloom changes). Offer to create new cards.
</study_session_flow>

---

## Card Creation Flow

<card_creation_rules>
Card creation is always user-triggered ("create a card about X", "save as card"). Creating cards without explicit user request disrupts the study schedule.

1. Generate concept (1-2 sentences), front_html, and back_html.
2. Show preview to the user by rendering the complete front_html and back_html visually (using the Visualizer, artifact, or equivalent rendering tool). Always render the actual card HTML — prose descriptions don't convey layout, colors, or interactivity.
3. Wait for user confirmation or change requests.
4. Only after explicit approval: call \`create_card\`.

### Front Side Rules
The front side is a static question prompt — answering happens in chat via \`ask_user_input_v0\`, not through the card HTML.
- Show the question only. The front must not reveal the answer.
- Keep it clean: term/concept + question.
- No interactive elements (sliders, diagrams, formula displays, input fields, textareas, or buttons) on the front. Exception: the MCQ template includes options and a check button for web self-study — these are part of the template and fine to keep, but in chat sessions the AI uses \`ask_user_input_v0\` instead.
- Choose template: mcq (multi-select), label-diagram, open-response, or simple styled question.

### Back Side Rules
- Always use the visual-explain template (progressive reveal accordion).
- 2-5 collapsible sections that build understanding step by step.
- Key terms in \`<mark>term</mark>\`.
- Use KaTeX for all formulas — HTML hacks like <sup>/<sub> render inconsistently and break with complex expressions.
- Diagrams (SVG, bar charts) when concept involves varying values.
- Optional interactive elements (sliders) for exploration.
- For MCQ cards: structure the back as one accordion section per option. Each section header shows the option letter + text. Each body explains WHY it is correct or wrong, with key terms highlighted.
</card_creation_rules>

---

## Bloom's Taxonomy Question Guide

| Level | Name       | Stems                                    | Example Pattern                                    | Card Types              |
|-------|------------|------------------------------------------|----------------------------------------------------|-------------------------|
| 0     | Remember   | What is…? Name… Which… Define…          | "Which of these is the definition of X?"           | multi_select, label diagram |
| 1     | Understand | Explain why… Describe how… Summarize…   | "Why does X happen?" / "Explain X and Y's relationship" | open_response, multi_select |
| 2     | Apply      | Given this scenario… Calculate… Predict… | "Given scenario S, what would X produce?"          | slider, multi_select     |
| 3     | Analyze    | Compare… How does X differ from Y…      | "Compare X and Y: which properties differ?"        | Open response, comparative|
| 4     | Evaluate   | Is this conclusion valid… Which is better…| "Which approach is better for scenario S and why?" | Open response + data     |
| 5     | Create     | Design… Propose… How would you build…    | "Design a system that solves X"                    | Open response            |

- For levels 3+: use \`get_similar_cards\` to craft cross-concept questions.
- Not every card reaches level 5. Recognize when a concept plateaus.
- The MCP server handles Bloom transitions: correct (rating ≥ 3) → move up; wrong (rating ≤ 2) → move down. FSRS handles scheduling independently.

### Question Variety Strategies

When checking previous question_text entries, vary along these dimensions (pick a different one each time):

1. **Direction flip**: If previous asked "What is X?", ask "Which of these is NOT X?"
2. **Context shift**: Same concept, different scenario or domain.
3. **Granularity change**: Ask about a specific detail instead of the whole concept, or vice versa.
4. **Format change**: If previous was MCQ, use a calculation or ordering question.
5. **Perspective shift**: Ask from the attacker's vs. user's vs. system's perspective.
6. **Edge case focus**: Ask about boundary conditions or exceptions.

If the card has 5+ reviews at the same Bloom level and you're struggling to find new angles, consider escalating to the next Bloom level even if the system hasn't promoted it yet (note this in the review).

---

## Response Evaluation Guide

<review_evaluation>
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

### "I Don't Know" Responses

If the user says they don't know or asks for explanation:

1. Give a targeted hint first rather than revealing the answer — the user learns more by reasoning through it.
2. Provide enough context to make the question answerable.
3. Re-present the same question (same options, same order).
4. If the user still can't answer after 2 hints, explain the answer and rate as 1 (Again).
5. Log user_answer as the explanation context (e.g. "Did not answer — needed explanation of X").
</review_evaluation>

---

## Visual Style (Quick Reference)

Light warm theme via Pico CSS (classless). Key colors: article bg #fafaf9, accent amber #d97706, accent teal #0d9488. Use semantic HTML — \`<article>\`, \`<mark>\`, \`<blockquote>\`, \`<details>/<summary>\`. Bloom level via \`data-bloom="N"\` attribute.

**Formulas:** Always use KaTeX from CDN (cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/) with \`$$...$$\` delimiters. HTML hacks like <sup>/<sub> render inconsistently and break with complex expressions.

For complete CSS, KaTeX setup, and SVG guidelines, see \`get_templates\`.

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
// Shared head — CDN links + common CSS prepended by get_templates handler
// ---------------------------------------------------------------------------

const SHARED_HEAD = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/picocss/2.1.1/pico.classless.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=swap">
<style>
:root{--pico-font-family:'Inter',sans-serif;--pico-font-size:93.75%}
html,body{margin:0;padding:0;background:transparent}
body>main{margin:0;padding:0;max-width:none}
[data-bloom]{display:inline-block;padding:3px 12px;border-radius:20px;font-size:.72em;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
[data-bloom="0"]{background:#fef3c7;color:#92400e}
[data-bloom="1"]{background:#ccfbf1;color:#115e59}
[data-bloom="2"]{background:#e0e7ff;color:#3730a3}
[data-bloom="3"]{background:#fce7f3;color:#9d174d}
[data-bloom="4"]{background:#ede9fe;color:#5b21b6}
[data-bloom="5"]{background:#fae8ff;color:#86198f}
article{border:1px solid #e7e5e4;background:#fafaf9}
blockquote{border-left-color:#d97706}
button{background:#d97706 !important;border-color:#d97706 !important}
button:hover{background:#b45309 !important}
</style>`;

// ---------------------------------------------------------------------------
// HTML Templates — each stores only template-specific CSS + content
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, { description: string; variables: string; html: string }> = {
  mcq: {
    description: "Multiple choice question with native checkboxes. Front side: user selects correct answers, clicks Check. Uses <article>, <fieldset>, <label> for semantic structure. Pair with a visual-explain back side.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}} (e.g. 'Remember'), {{QUESTION}}, {{CONTEXT}} (optional blockquote), {{OPTIONS}} (checkboxes with data-correct), {{FEEDBACK}} (shown on perfect score)",
    html: `<style>
fieldset{border:none;padding:0;margin:0 0 8px}
fieldset label{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;border:1px solid #d6d3d1;margin:6px 0;cursor:pointer;transition:all .15s;width:100% !important;max-width:100% !important;background:white}
fieldset label:hover{border-color:#d97706;background:#fffbeb}
fieldset label.correct{border-color:#0d9488;background:#ccfbf1}
fieldset label.wrong{border-color:#e11d48;background:#fff1f2}
fieldset label.missed{border-color:#d97706;background:#fef3c7;opacity:.7}
fieldset label.disabled{pointer-events:none}
.fb{margin-top:12px;padding:12px 14px;border-radius:12px;font-size:.9em;display:none}
.fb.perfect{display:block;background:#ccfbf1;border:1px solid #0d9488;color:#115e59}
.fb.partial{display:block;background:#fef3c7;border:1px solid #d97706;color:#92400e}
.fb.fail{display:block;background:#fff1f2;border:1px solid #e11d48;color:#9f1239}
</style>
<article>
  <span data-bloom="{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</span>
  <!-- Optional: <blockquote>{{CONTEXT}}</blockquote> -->
  <p>{{QUESTION}}</p>
  <small>Select all that apply</small>
  <fieldset id="opts">
    <!-- Replace with actual options -->
    <label><input type="checkbox" data-correct="true"> Option A text</label>
    <label><input type="checkbox" data-correct="false"> Option B text</label>
  </fieldset>
  <button onclick="lfCheck()">Check Answers</button>
  <div class="fb" id="fb"></div>
</article>
<script>
function lfCheck(){const labels=document.querySelectorAll('#opts label');const btn=document.querySelector('button');btn.disabled=true;btn.textContent='Checked';let correct=0,total=0,wrong=0;labels.forEach(l=>{l.classList.add('disabled');const cb=l.querySelector('input');cb.disabled=true;const isC=cb.dataset.correct==='true';const isS=cb.checked;if(isC)total++;if(isC&&isS){l.classList.add('correct');correct++}else if(isC&&!isS){l.classList.add('missed')}else if(!isC&&isS){l.classList.add('wrong');wrong++}});const fb=document.getElementById('fb');if(correct===total&&wrong===0){fb.className='fb perfect';fb.textContent='{{FEEDBACK}}'}else if(correct>0){fb.className='fb partial';fb.textContent=correct+' of '+total+' correct. Flip the card for explanations.'}else{fb.className='fb fail';fb.textContent='None correct. Flip the card for explanations.'}}
</script>`,
  },

  "open-response": {
    description: "Static question prompt for the front side — no interactive elements. The user answers in chat via ask_user_input_v0, not through card HTML. Uses <article> with <blockquote> for context.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{CONTEXT}} (blockquote text)",
    html: `<article>
  <span data-bloom="{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</span>
  <blockquote>{{CONTEXT}}</blockquote>
  <p>{{QUESTION}}</p>
</article>`,
  },

  "visual-explain": {
    description: "Progressive reveal accordion — ALWAYS used for the back side of cards. Structure explanations as 2-5 collapsible <details>/<summary> sections. Use <mark> for key terms, KaTeX for formulas.",
    variables: "{{TITLE}}, {{SECTIONS}} (array of {header, body} — body can contain <mark>terms</mark>, KaTeX $$formulas$$, SVG diagrams)",
    html: `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>
<style>
details{margin:10px 0;border:1px solid #e7e5e4;border-radius:12px;background:white;overflow:hidden}
summary{display:flex;align-items:center;padding:14px 16px;cursor:pointer;font-weight:600;font-size:.95em;list-style:none}
summary:hover{background:#f5f5f4}
summary::-webkit-details-marker{display:none}
details[open] summary{background:#f5f5f4;border-bottom:1px solid #e7e5e4}
details>div{padding:14px 16px}
details p{margin:0 0 8px;font-size:.9em;line-height:1.65;color:#44403c}
details p:last-child{margin-bottom:0}
.formula-block{text-align:center;margin:12px 0;padding:14px;background:#fefce8;border-radius:10px;border:1px solid #fde68a}
</style>
<article>
  <small>Answer / Explanation</small>
  <h4>{{TITLE}}</h4>
  <!-- Replace with topic-specific sections (2-5) -->
  <details>
    <summary>1. Section Title</summary>
    <div><p>Section content with <mark>key terms</mark> highlighted.</p></div>
  </details>
  <details>
    <summary>2. Section Title</summary>
    <div><p>More content. Use $$formula$$ for math.</p>
    <div class="formula-block">$$E = mc^2$$</div></div>
  </details>
</article>
<script>renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:false}]});</script>`,
  },

  "label-diagram": {
    description: "Drag-and-drop label placement on SVG diagrams. Uses .dz drop zones in SVG foreignObject and .chip draggable labels. Event delegation on .diagram container handles all drag events.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{SVG_DIAGRAM}} (inline SVG with foreignObject .dz drop zones), {{LABELS}} (array of {label, text} as .chip spans)",
    html: `<style>
.diagram{background:#fffbeb;border-radius:12px;padding:14px;border:1px solid #fde68a;margin-bottom:24px}
.diagram svg{width:100%;max-height:260px;display:block}
.dz{display:inline-flex;align-items:center;justify-content:center;min-width:90px;min-height:28px;padding:4px 10px;border:2px dashed #d6d3d1;color:#a8a29e;background:white;border-radius:8px;font-size:.8em;transition:all .15s}
.dz.over{border-color:#0d9488;background:#f0fdfa}
.dz.filled{border-style:solid;border-color:#0d9488;color:#115e59;background:#ccfbf1;font-weight:600}
.dz.correct{border-color:#059669;color:#065f46;background:#dcfce7}
.dz.wrong{border-color:#e11d48;color:#9f1239;background:#fff1f2}
.bank{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid #e7e5e4}
.chip{padding:6px 14px;border-radius:8px;font-size:.82em;font-weight:600;cursor:grab;user-select:none;background:#0d9488;color:white;border:none}
.chip.placed{opacity:.25;cursor:default;pointer-events:none}
.fb{margin-top:12px;padding:12px 14px;border-radius:12px;font-size:.9em;display:none}
.fb.correct{display:block;background:#ccfbf1;border:1px solid #0d9488;color:#115e59}
.fb.partial{display:block;background:#fef3c7;border:1px solid #d97706;color:#92400e}
</style>
<article>
  <span data-bloom="{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</span>
  <p>{{QUESTION}}</p>
  <div class="diagram">
    <!-- Replace SVG and drop zones with topic-specific diagram -->
    <svg viewBox="0 0 460 200" xmlns="http://www.w3.org/2000/svg">
      <!-- SVG content with foreignObject .dz drop zones using data-answer attributes -->
    </svg>
    <div class="bank">
      <!-- .chip spans with data-label and draggable="true" -->
    </div>
  </div>
  <button onclick="lfCheck()">Check Answers</button>
  <div class="fb" id="fb"></div>
</article>
<script>
document.querySelector('.diagram').addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='move'});
document.querySelector('.diagram').addEventListener('dragenter',function(e){const z=e.target.closest('.dz');if(z)z.classList.add('over')});
document.querySelector('.diagram').addEventListener('dragleave',function(e){const z=e.target.closest('.dz');if(z)z.classList.remove('over')});
document.querySelector('.diagram').addEventListener('drop',function(e){e.preventDefault();const z=e.target.closest('.dz');if(!z||z.classList.contains('filled'))return;z.classList.remove('over');const l=e.dataTransfer.getData('text/plain');const c=document.querySelector('.chip[data-label="'+l+'"]');if(!c||c.classList.contains('placed'))return;z.textContent=c.textContent;z.dataset.placed=l;z.classList.add('filled');c.classList.add('placed');c.draggable=false});
document.querySelector('.bank').addEventListener('dragstart',function(e){if(e.target.classList.contains('chip')){e.dataTransfer.setData('text/plain',e.target.dataset.label);e.dataTransfer.effectAllowed='move'}});
function lfCheck(){const zones=document.querySelectorAll('.dz');let c=0,t=zones.length;zones.forEach(z=>{if(z.dataset.placed===z.dataset.answer){z.classList.add('correct');c++}else if(z.dataset.placed)z.classList.add('wrong')});const fb=document.getElementById('fb');fb.className='fb '+(c===t?'correct':'partial');fb.textContent=c===t?'All '+t+' labels correct!':c+' of '+t+' correct. Review the highlighted zones.'}
</script>`,
  },

  slider: {
    description: "Range input sliders for value manipulation. Use for back side or Apply+ level Bloom questions. NOT for initial front_html. Uses Pico CSS native range styling.",
    variables: "{{BLOOM_LEVEL}} (0-5), {{BLOOM_TAG}}, {{QUESTION}}, {{SLIDERS}} (array of {name, label, unit, min, max, default, step?}), {{FORMULA_JS}} (JS expression), {{TARGET_VALUE}}, {{RESULT_UNIT}}, {{TARGET_TOLERANCE}}",
    html: `<style>
.result{text-align:center;margin:20px 0;padding:18px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a}
.result-val{font-size:2em;font-weight:800;color:#b45309}
.result-label{font-size:.82em;color:#78716c;margin-top:4px}
.result-formula{margin-top:8px;font-family:monospace;font-size:.82em;color:#78716c}
.target{font-size:.85em;margin-top:10px;padding:6px 16px;border-radius:20px;display:inline-block;font-weight:600;transition:all .3s}
.target.hit{background:#ccfbf1;color:#115e59}
.target.close{background:#fef3c7;color:#92400e}
.target.far{background:#fff1f2;color:#9f1239}
</style>
<article>
  <span data-bloom="{{BLOOM_LEVEL}}">{{BLOOM_TAG}}</span>
  <p>{{QUESTION}}</p>
  <!-- Replace with topic-specific sliders -->
  <label>{{SLIDER_LABEL}} <span id="sv-{{SLIDER_NAME}}">{{SLIDER_DEFAULT}} {{SLIDER_UNIT}}</span>
    <input type="range" min="{{MIN}}" max="{{MAX}}" value="{{DEFAULT}}" step="{{STEP}}" data-name="{{SLIDER_NAME}}" data-unit="{{SLIDER_UNIT}}" oninput="lfUpdate()">
  </label>
  <div class="result">
    <div class="result-val" id="result-val">0</div>
    <div class="result-label">{{RESULT_LABEL}}</div>
    <div class="result-formula">{{FORMULA_DISPLAY}}</div>
    <div class="target" id="target">Target: {{TARGET_VALUE}} {{RESULT_UNIT}}</div>
  </div>
</article>
<script>
const cfg={formula:v=>{{FORMULA_JS}},targetValue:{{TARGET_VALUE}},targetTolerance:{{TARGET_TOLERANCE}},resultUnit:'{{RESULT_UNIT}}'};
function lfUpdate(){const sliders=document.querySelectorAll('input[type=range]');const vars={};sliders.forEach(s=>{vars[s.dataset.name]=parseFloat(s.value);document.getElementById('sv-'+s.dataset.name).textContent=s.value+' '+s.dataset.unit});const result=cfg.formula(vars);document.getElementById('result-val').textContent=result.toFixed(2)+' '+cfg.resultUnit;const diff=Math.abs(result-cfg.targetValue);const t=document.getElementById('target');if(diff<=cfg.targetTolerance){t.className='target hit';t.textContent='Target reached!'}else if(diff<.15*cfg.targetValue){t.className='target close';t.textContent='Getting close... Target: '+cfg.targetValue.toFixed(2)+' '+cfg.resultUnit}else{t.className='target far';t.textContent='Keep adjusting... Target: '+cfg.targetValue.toFixed(2)+' '+cfg.resultUnit}}
lfUpdate();
</script>`,
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
          html: SHARED_HEAD + t.html,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      // Return all templates
      const all = Object.entries(TEMPLATES).map(([name, t]) => ({
        name,
        description: t.description,
        variables: t.variables,
        html: SHARED_HEAD + t.html,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(all, null, 2) }] };
    },
  );
}
