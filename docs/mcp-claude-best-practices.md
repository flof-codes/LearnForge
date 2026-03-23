# MCP + Claude Best Practices

Research-backed guidelines for writing MCP server instructions that maximize Claude's adherence. Compiled from Anthropic's official documentation, MCP specification guidance, and real-world MCP server experience.

---

## 1. Claude 4.6 Responsiveness: Dial Back Aggressive Language

Claude Opus 4.6 and Sonnet 4.5+ are significantly more responsive to system prompts and tool descriptions than older models. Instructions designed to combat undertriggering on earlier models now cause **overtriggering**.

**Action:** Replace `CRITICAL:`, `MUST`, `NEVER`, `ALL CAPS` emphasis with natural language. Reserve emphasis markers (`IMPORTANT`, `YOU MUST`) only for rules that Claude has actually violated in testing.

| Before (overtriggers on 4.6) | After (natural + motivation) |
|------------------------------|------------------------------|
| `CRITICAL: You MUST use this tool when...` | `Use this tool when...` |
| `NEVER create a card without confirmation` | `Card creation requires user approval because accidental cards disrupt the spaced repetition schedule` |
| `Do NOT batch reviews` | `Submit reviews after each card (not batched) because FSRS scheduling accuracy depends on individual response timing` |

**Key insight:** Providing the *why* behind a rule is more effective than shouting. Claude generalizes from explanations and applies rules correctly in novel situations.

Sources:
- [Claude 4 Best Practices](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

---

## 2. Instruction Structure: XML Tags + Markdown

Claude is fine-tuned to pay special attention to XML tags. They provide unambiguous section boundaries that reduce misinterpretation in complex prompts.

**When to use XML tags:**
- Complex prompts mixing multiple content types (rules, context, examples)
- Behavioral sections that must be clearly separated from reference information
- Wrapping examples so Claude distinguishes them from instructions

**When Markdown headers suffice:**
- Simpler instruction sets
- Sequential step-by-step workflows (numbered lists work well here)

**Anthropic's own pattern** — descriptive XML tag names as structural emphasis:
```xml
<study_session_flow>
  1. Call get_study_summary...
  2. Ask the user which topic...
</study_session_flow>

<card_creation_rules>
  Card creation requires user approval because...
</card_creation_rules>
```

The tag name itself communicates the purpose and scope of the content.

**Prompt layout for best results:**
1. Long documents and reference data (top)
2. Instructions and behavioral rules (middle)
3. The actual query or task (bottom)

Queries at the end improve response quality by up to 30% with complex inputs.

Sources:
- [Use XML Tags to Structure Prompts](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags)

---

## 3. Tool Descriptions: The #1 Factor in Tool Performance

Anthropic's documentation is unambiguous: tool descriptions are the single most important factor in tool performance.

**Minimum 3-4 sentences per tool description.** Each should cover:
- What the tool does
- When it should be used
- When it should NOT be used
- What it returns
- Important limitations

**Parameter descriptions** should include: meaning, format requirements, valid values, and examples.

```
BAD:  "Gets the stock price for a ticker."

GOOD: "Retrieves the current stock price for a given ticker symbol. The ticker
       symbol must be a valid symbol for a publicly traded company on a major US
       stock exchange like NYSE or NASDAQ. The tool will return the latest trade
       price in USD. It should be used when the user asks about the current or
       most recent price of a specific stock. It will not provide any other
       information about the stock or company."
```

**Tool naming matters:** Use meaningful, action-oriented names. Blockscout found that renaming `__get_instructions__` to `__unlock_blockchain_analysis__` dramatically improved adherence — the verb "unlock" creates a semantic signal of mandatory initialization.

**Namespace tool names** with service prefixes (e.g., `learnforge_create_card`) when exposing many tools. Prefix vs. suffix naming has non-trivial effects on tool-use evaluations.

Sources:
- [Implement Tool Use](https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/implement-tool-use)
- [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Blockscout MCP Experience](https://www.blog.blockscout.com/mcp-explained-part-8-server-instructions/)

---

## 4. MCP Server Instructions Field

The MCP spec provides a dedicated `instructions` field in server metadata — a brief cross-tool workflow guide injected at connection time. This is separate from tool descriptions and serves as a "user manual" for the server.

**Best practices for the instructions field:**
- Keep under ~250 words
- Focus on tool sequencing and workflow, not duplicating tool descriptions
- Factual and model-agnostic
- Acts as a pointer to detailed resources, not a replacement

```typescript
const server = new McpServer({
  name: "learnforge",
  version: "1.0.0",
  instructions: `LearnForge spaced repetition tutor with Bloom's Taxonomy progression.

Session start: Call get_instructions to load the tutor workflow.
Study: get_study_summary -> get_study_cards -> [question loop with submit_review per card].
Card creation: Preview -> user approval -> create_card. Call get_templates for HTML templates.
Cross-concept questions (Bloom 3+): Use get_similar_cards for context.`
});
```

**Dual delivery:** Some clients (like Claude Desktop) may ignore the `instructions` field. The pattern of having both server instructions AND a dedicated instruction tool (like `get_instructions`) ensures coverage.

Sources:
- [Server Instructions Blog Post](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)
- [GitHub MCP Server](https://github.blog/changelog/2025-10-29-github-mcp-server-now-comes-with-server-instructions-better-tools-and-more/)

---

## 5. Instruction Length and Token Efficiency

**The context window is a shared resource.** Every token in your instructions competes with conversation history, other tools, and the user's actual request.

**Guidelines:**
- Server-level instructions: under ~250 words
- On-demand instruction tools: acceptable to be longer since tokens are only consumed when called
- For each instruction, ask: "Does Claude really need this? Can I assume Claude already knows this?"

**Progressive disclosure over monolithic dumps:**
- Core workflow in the main instruction tool (the "80% case")
- Reference material (Bloom's taxonomy details, question variety strategies) in optional tools or sections
- Templates already parameterized via `template_name` — encourage individual requests over "get all"

**Instruction adherence degrades with count:**
- Frontier models (Opus 4.6): linear decay — performance degrades gradually with more instructions
- Smaller models: exponential decay — much worse, much faster
- Frontier models reliably follow ~150-200 instructions
- Claude Code's system prompt already consumes ~50 of those

**Placement matters:**
- Beginning and end of prompt: highest weight
- Middle: lowest weight
- Put most critical rules at the very top or very end

Sources:
- [Skill Authoring Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

---

## 6. Positive Framing and Examples

**Positive instructions outperform negative ones:**

| Negative (less effective) | Positive (more effective) |
|--------------------------|--------------------------|
| "Do not use markdown" | "Write in smoothly flowing prose paragraphs" |
| "Don't batch reviews" | "Submit reviews individually after each card" |
| "Never show raw HTML" | "Render cards visually using the artifact viewer" |

**Examples are the most reliable steering mechanism.** Include 3-5 concrete examples wrapped in `<example>` tags. Make them relevant (mirror actual use cases), diverse (cover edge cases), and aligned with desired behavior.

```xml
<example>
User answers MCQ correctly (all options right, no wrong selections):
→ Feedback: "Correct! You identified all three CSP directives..."
→ Rating: 4 (Easy)
→ Bloom: stays at current level or advances
</example>

<example>
User answers MCQ partially (2 of 3 correct, 1 wrong selection):
→ Feedback: "Good start — you got X and Y right, but Z is actually..."
→ Rating: 2 (Hard)
→ Bloom: stays at current level
</example>
```

Claude 4.x models pay very close attention to example details — ensure they align exactly with desired behavior.

Sources:
- [Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

---

## 7. Error Messages as Instruction Reinforcement

Every textual element shapes Claude's behavior — including error messages. Make tool error responses actionable and instructive.

```
BAD:  "Error: missing topic_id"

GOOD: "topic_id is required. Call list_topics to find available topics,
       or create a new topic with create_topic."
```

This turns errors into learning signals that guide Claude toward correct tool usage.

Sources:
- [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [MCP Best Practices - Phil Schmid](https://www.philschmid.de/mcp-best-practices)

---

## 8. General MCP Server Design Principles

From Phil Schmid's "MCP Is Not the Problem, It's Your Server":

1. **Outcomes, not operations** — design tools around agent goals, not API endpoints
2. **Flatten arguments** — use top-level primitives, literal types, sensible defaults
3. **Instructions as context** — every textual element (docstrings, error messages) shapes behavior
4. **Ruthless curation** — maintain 5-15 tools per server; each description competes for context
5. **Service-prefixed naming** — `{service}_{action}_{resource}`
6. **Pagination with metadata** — return `has_more`, `next_offset`, `total_count`

From Anthropic's agent tools guide:
- **Meaningful identifiers over cryptic IDs** — resolving UUIDs to semantic labels significantly improves precision
- **Consolidate related operations** — a single tool with mode parameters beats many granular tools
- **Use evaluation transcripts** to iteratively improve tool descriptions

Sources:
- [MCP Is Not the Problem, It's Your Server](https://www.philschmid.de/mcp-best-practices)
- [MCP Best Practices: Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/)

---

## Checklist for LearnForge

- [ ] Replace aggressive emphasis (`CRITICAL`, `MUST`, `NEVER`) with natural language + motivation
- [ ] Add `instructions` field to MCP server constructor
- [ ] Audit all 15+ tool descriptions for 3-4 sentence minimum
- [ ] Consider renaming `get_instructions` to action-oriented name (e.g., `initialize_tutor_session`)
- [ ] Wrap key behavioral sections in XML tags
- [ ] Add 3-5 concrete examples for critical behaviors (MCQ evaluation, review submission)
- [ ] Apply progressive disclosure — split core workflow from reference material
- [ ] Add "why" rationale to every behavioral rule
- [ ] Make error messages actionable and instructive
- [ ] Frame rules positively ("do X") instead of negatively ("don't do X")
- [ ] Test instruction adherence and iterate based on real session transcripts
