# Read Code Trainer — Build Spec

## Purpose

A personal training tool to build one specific skill: reading AI-generated code output and correctly identifying whether it will run, and whether it does what was intended. This is not "learn to code" — it's "learn to review code an agent already wrote," which is a narrower and more learnable skill.

Two failure modes to train for, since they require different instincts:

1. **Runtime correctness** — will this code actually execute without crashing? (mechanical, learnable by pattern + testing)
2. **Business-logic / process-integrity risk** — does this match intent, and what happens when it partially fails? (closer to existing systems-thinking strengths — the tool should confirm this is already working, not teach it from scratch)

## Target user

One person, self-directed, no formal programming background. Comfortable directing AI coding agents and making architecture decisions, not comfortable tracing code execution line-by-line yet. Prior test result: correctly traced a 6-line function's sequence of operations, missed that a runtime type error (`None > 10`) would halt execution entirely.

## Core mechanic

Show a short code snippet (5–20 lines) framed as "an agent just built this for you." Ask the user to answer, in plain language, before revealing the answer:

- What does this code do, step by step?
- Will it run without error? If not, where does it break and why?
- Does it do what was actually asked for? Flag anything invented, missing, or silently wrong.

Then reveal an annotated answer key highlighting exactly which parts were runtime bugs vs. logic/process bugs, plus a one-line "why this matters" note tying it back to real consequences (wrong charge, data leak, customer told the wrong thing, etc.).

## Difficulty progression

Structure exercises in tiers so the tool can track "you're ready for the next level" rather than random difficulty:

- **Tier 1 — Sequence tracing.** Straight-line code, no bugs. Confirms the user can follow control flow (if/else, loops) without needing to spot problems yet.
- **Tier 2 — Single obvious bug.** One clear runtime bug (wrong type comparison, undefined variable, off-by-one) with nothing else wrong. Builds pattern recognition for the most common failure types.
- **Tier 3 — Single obvious bug, real-world framing.** Same as Tier 2 but embedded in a business scenario (order processing, customer records, approvals) so the "why does this matter" reasoning gets exercised alongside the technical spot.
- **Tier 4 — Mixed bugs.** 2–4 bugs combined: at least one runtime bug, at least one logic/process bug (silently invented behavior, wrong operation order, missing rollback). This is the realistic "agent output" tier — matches what actually shows up in practice.
- **Tier 5 — Clean but subtly wrong.** Code that runs fine and looks reasonable but doesn't do what was asked (wrong discount stacking, race condition, ignores an edge case in the spec). No crash to catch — pure "does this match intent" reasoning, hardest tier.

## Bug pattern library

Seed the exercise generator with a fixed list of realistic bug categories so exercises stay grounded rather than arbitrary. Starting list, expand as needed:

**Runtime bugs:**
- Mutable default argument (list/dict as a default parameter, shared across calls)
- None vs. 0 vs. empty-string confusion in a comparison or arithmetic op
- Off-by-one in a loop or slice
- Wrong variable referenced (shadowing, typo-adjacent name)
- Type mismatch passed into a function expecting something else
- Missing null/None check before an operation that requires a value

**Logic / process-integrity bugs:**
- Invented business rule not in the original ask (extra discount, extra fee, silent default)
- Side effect (email, notification, external call) happens before the state that guarantees it's true is committed
- No rollback / no error handling on a multi-step operation, so a partial failure leaves inconsistent state
- Wrong order of operations (validation after the action instead of before)
- Silently swallowed error (empty except block, ignored return value)
- Missing edge case from the original spec (e.g. spec said "for orders over $500" but code checks `>= 500` or omits the condition)

## Format for each exercise

```
exercise_id
tier: 1-5
scenario: one-line real-world framing (order approval, HR onboarding step, etc.)
code: the snippet
prompt: "What does this do? Will it run? Does it match the ask?"
answer_key:
  - trace: correct step-by-step walkthrough
  - runtime_verdict: will it crash — yes/no, where, why
  - logic_verdict: what's invented, missing, or wrong vs. intent
  - stakes_note: one sentence on real consequence if shipped
tags: [bug pattern names used]
```

## Progress tracking

Minimal, not gamified — the point is honest self-assessment, not points:

- Track per-tier: attempts, correct runtime calls, correct logic calls (score these separately — they're different skills, per the Core Mechanic section)
- Flag: "ready for next tier" once a rolling accuracy threshold is hit (suggest 4/5 correct on both dimensions, not just overall)
- Keep a running list of bug patterns still consistently missed, so review sessions can be weighted toward weak spots instead of random

## Suggested build approach

This is a good first real Claude Code project — small, testable, useful, and the process of building it (and reviewing what the agent produces) is itself practice for the exact skill the tool trains.

- **Language/stack:** whatever the agent defaults to comfortably — a simple local script or small web app is enough; no need for a database beyond a JSON or SQLite file for exercises + progress.
- **Content generation:** rather than hand-writing every exercise, ask the agent to generate new snippets against the Bug Pattern Library above, tier by tier, then spot-check a handful before trusting the batch. Vary the scenario framing (orders, onboarding, invoicing, scheduling) so pattern recognition doesn't collapse into "memorize this one story."
- **Review loop:** after building each version, deliberately do the review exercise from the last session — read the agent's own output, trace it, decide if it runs, before running it. Compare your call against actually executing it. That's the training loop, applied to the tool's own construction.

## Explicit non-goals

- Not a general "learn Python" course — no syntax lessons, no unrelated language features
- Not testing writing code — only reading and judging it
- Not scored against other people — self-referential progress only
