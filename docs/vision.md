# LearnForge Vision

## Origin Story

LearnForge started three weeks ago as a tool built for one person -- me.

I study medicine, computer science, and mathematics. I use flashcards daily. And I kept running into the same problem: after seeing a card enough times, I wasn't recalling the concept anymore. I was recognizing the card. The layout, the phrasing, the position of the answer -- my brain took shortcuts, and I didn't notice until an exam question phrased things differently and I went blank.

The second problem was simpler: creating cards is tedious. I was already learning with AI, having conversations about complex topics, building understanding through dialogue. But none of that knowledge was being captured. Every conversation disappeared. Every insight had to be manually turned into a card, typed out, formatted, filed into the right topic.

So I built LearnForge to solve both problems:
1. **Every review is different.** The AI reformulates each question so you can never memorize the card -- only the concept.
2. **Cards are created through conversation.** Tell the AI what you learned, and it creates a well-formatted, interactive card and files it where it belongs.

Then I realized it could do more. If the AI already knows what you've learned, it can track *how deeply* you understand each concept. Not just "do you remember this?" but "can you analyze it? Can you evaluate it? Can you create with it?" That's Bloom's Taxonomy -- six levels of cognitive depth, applied to every card, progressing automatically as you demonstrate mastery.

It worked. It worked really well. So here we are.

---

## The Problem We Solve

### The Recognition Trap
Traditional flashcard apps show you the same card, the same way, every single time. After enough reviews, your brain doesn't recall the answer -- it recognizes the card. You see the familiar layout, the specific phrasing, the visual pattern, and the answer surfaces through recognition rather than genuine understanding. This creates an illusion of competence that breaks down the moment you face the same concept in a different context -- like an exam.

### The Card Creation Tax
Every flashcard you study, someone had to create manually. That someone is usually you. Formatting, organizing, double-checking -- hours spent on card management instead of actual learning. Even "AI-powered" tools only automate the initial generation. The cards they produce are still static forever after.

### The Depth Ceiling
Every existing spaced repetition tool treats learning as binary: you know it or you don't. A rating of "Good" on a basic recall question is treated the same whether you learned the concept yesterday or six months ago. There's no progression from "I can recite the definition" to "I can apply this in a novel situation." The ceiling is always the same: flat, surface-level recall.

### The Self-Rating Problem
Most flashcard apps ask *you* to judge whether you got it right. But learners consistently overestimate their understanding (the Dunning-Kruger effect). Self-rating creates a feedback loop where partial understanding is reinforced as full mastery.

---

## The Vision

**LearnForge is the memory guardian that never lets you forget what you've learned -- and ensures you understand it deeply enough to actually use it.**

We don't teach. Books teach. Lectures teach. AI conversations teach. LearnForge is what happens *after* you learn something. It captures that knowledge, tracks your understanding depth, and makes sure it stays with you -- through scientifically scheduled, dynamically reformulated, progressively challenging reviews.

The long-term vision isn't a rigid roadmap. It's a direction:

**Make the gap between "I learned this" and "I'll remember this forever" as small as possible.**

Every feature decision, every design choice, every line of code should make that gap smaller.

---

## How We're Different

### 1. Never See the Same Question Twice
Every review dynamically reformulates the question. Different phrasing, different angle, different format. You can't fake understanding by recognizing a card layout. This is the most fundamental differentiator.

### 2. Cognitive Depth Tracking (Bloom's Taxonomy)
Six levels of understanding per concept: Remember, Understand, Apply, Analyze, Evaluate, Create. The system automatically escalates difficulty as you demonstrate mastery. "What is osmosis?" becomes "Design an experiment to measure osmosis rate" -- same concept, completely different cognitive demand.

Simplified: **From "what is it?" to "what would you do with it?"**

### 3. AI-Native Card Creation
Create cards through natural conversation with AI. Describe what you learned, and the system creates interactive, well-formatted cards with the right topic, tags, and formatting -- including KaTeX formulas, diagrams, and interactive elements. No manual typing, no formatting wrestling.

### 4. Multiple Study Modalities
Choose how you want to study:
- **Classic web review** -- self-rated, Anki-style (0.95x interval)
- **Multiple choice** -- faster, tests discrimination between concepts (1.05x interval)
- **Open questions via AI** -- deepest learning, AI evaluates your actual answer (1.2x interval)

Harder modalities earn longer intervals. The system rewards deeper engagement.

### 5. Science-Backed Scheduling (FSRS)
The FSRS algorithm adapts to your individual memory patterns. No "ease factor hell," no one-size-fits-all intervals. Combined with modality-aware multipliers, every review is optimally timed.

### 6. Open Source, Self-Hostable
Your learning data is yours. The entire platform is open source (AGPL-3.0). Self-host it on your own infrastructure, or use the hosted version. No vendor lock-in, no data hostage situations.

---

## Guiding Principles

These are non-negotiable. Every decision filters through them.

### Science First
Every feature must be grounded in learning science -- spaced repetition research, cognitive load theory, Bloom's Taxonomy, retrieval practice. No gimmicks. No gamification for its own sake. If the science doesn't support it, we don't build it.

### Quality Over Quantity
Fewer features done well. No bloat. Every interaction should feel intentional and well-crafted. Three solid features beat ten half-finished ones. We ship when it's right, not when it's "good enough."

### AI as a Tool, Not a Crutch
AI helps you learn -- it doesn't learn for you. The learner does the thinking. AI handles the busywork: creating cards, scheduling reviews, reformulating questions, evaluating answers. But the cognitive effort of understanding? That's yours. That's the point.

### Your Data, Your Control
Open source. Self-hostable. No vendor lock-in. Your learning history, your progress, your cards -- they belong to you. We will never hold your data hostage to keep you subscribed.

---

## Current State (v1)

LearnForge is real, it works, and it's actively used daily. The current version includes:

- Full spaced repetition system with FSRS scheduling
- Bloom's Taxonomy progression (6 levels, automatic escalation)
- MCP server for AI-powered study sessions and card creation
- 5 interactive card templates (MCQ, open response, visual explain, label diagram, slider)
- Web UI with dashboard, study sessions, topic management
- Multi-user authentication with JWT + MCP API keys
- KaTeX formula rendering, SVG diagrams, interactive elements
- Light/dark/auto theme
- Bilingual (EN/DE)
- Stripe billing with 30-day free trial
- Docker Compose deployment

**This is v1 -- complete enough to use daily, with a clear path forward.**

---

## What's Next

LearnForge evolves organically. No rigid 12-month roadmap -- the direction is guided by daily use and community feedback. That said, there are clear areas of focus:

### Near-term Focus
- **Context files for AI** -- Upload background materials (lecture notes, textbook chapters) so the AI has deeper context when creating cards and asking questions. Especially valuable for complex subjects like anatomy.
- **Image integration** -- Rich image support for visual learning domains. Anatomy diagrams, labeled figures, visual cards that go beyond text.
- **Faster AI conversations** -- Reduce latency between cards during AI study sessions. The flow should feel natural, not like waiting for a loading screen.

### Ongoing
- Performance and reliability improvements
- Community feedback-driven features
- Better onboarding for new users
- Documentation and self-hosting guides

### Open to Exploration
- Mobile experience (PWA or native)
- Import from other tools (Anki .apkg, CSV)
- Shared decks and community content
- Additional AI provider support
- Plugin/extension system

The roadmap is intentionally open. The best features will come from real usage -- mine and the community's.

---

## Sustainability

LearnForge is sustained through hosted subscriptions. The open-source version is free forever for self-hosters.

The honest truth: if subscriptions don't take off, I'll keep developing LearnForge anyway. It already works great for my own learning, and that's reason enough. But subscriptions would let me dedicate more time to it, build features faster, and make it available to people who don't want to self-host.

If you want to support the project:
- **Subscribe** to the hosted version
- **Contribute** code, ideas, or bug reports on GitHub
- **Share** LearnForge with someone who would benefit from it

That's more than enough.

---

## Community

LearnForge is built for learners who take learning seriously. The community should reflect that.

**"Shape the future"** -- Your feedback directly shapes the roadmap. Every feature request gets read. This is v1, and your voice decides what v2 looks like.

We want people who:
- Care about understanding, not just passing
- Are willing to try new approaches to learning
- Give honest feedback -- what works, what doesn't, what's missing
- Respect that this is a passion project with real ambition

We don't need thousands of users. We need the right ones.

---

*Last updated: 2026-03-18*
*This document is the north star for product decisions. When in doubt, refer back to the principles.*
