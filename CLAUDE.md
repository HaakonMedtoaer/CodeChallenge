# Notes for Claude Code

A static site, no build step, no dependencies. Vanilla JS with classic `<script>`
tags on purpose — it must work when opened from `file://` as readily as from
GitHub Pages, so no modules and no bundler.

## Before committing anything

```sh
node tools/verify.mjs     # executes every snippet through real Python
node tools/selftest.mjs   # progression rules, storage, merge, content integrity
```

Both must pass. `verify.mjs` needs `python` on PATH (override with `PYTHON=...`).

## The rule that matters most

**An exercise with a wrong answer key is worse than no exercise.** It teaches the
wrong instinct, and the user has no way to know. Never hand-write a key and trust
it — `verify.mjs` runs the snippet and will tell you if the key is lying. If you
add or edit an exercise, run it before you commit, every time.

## Adding a batch of exercises

The usual request is "add N more, weighted toward the patterns I keep missing."
Those patterns come from the app's Progress tab; ask if they were not named.

Each exercise goes in `data/tier<N>.js` and must honour its tier's contract:

| Tier | Contract |
|------|----------|
| 1 | No bugs at all. Runs clean, `logic.matches: true`, `bugs: []`. |
| 2 | Exactly one defect, minimal framing. |
| 3 | Exactly one defect, inside a real business process with real consequences. |
| 4 | 2–4 defects, at least one `runtime` **and** at least one `logic`. |
| 5 | Must **not** crash. The defect is purely "does not match the ask." |

`verify.mjs` enforces all of these, plus: every `bugs[].tag` must exist in
`data/patterns.js`, a crashing key must name `runtime.where`, and every exercise
needs a trace and a stakes note.

Other things to hold to:

- **Snippets must be self-contained and runnable.** Include the calls that
  exercise the defect. Use small stub classes rather than imports where a snippet
  needs a gateway, client or mailer.
- **Vary the scenario framing** — orders, onboarding, invoicing, scheduling,
  approvals, incidents. Pattern recognition collapses into "memorise this one
  story" if every exercise is a webshop.
- **The `ask` is load-bearing** from tier 3 up. Logic defects are only judgeable
  against a stated intent, and tier 5 is *entirely* the gap between the ask and
  the code.
- **`stakes` should name a concrete consequence** — wrong charge, data leak,
  customer told the wrong thing, payroll halted partway. Not "this is a bug."
- **Trace steps are the teaching.** Walk the actual values, and say *why* the
  failure happens, not just where.
- Tier placement is about how many defects and how much framing, not how hard the
  Python is. Keep the language plain throughout; the difficulty is in the reading.

## Adding a new bug pattern

Add it to `data/patterns.js` with a `kind` of `runtime`, `logic`, or `both`
(`both` for patterns like off-by-one that surface either way, sometimes raising
and sometimes quietly returning the wrong answer). Give it a `hint` that says what
to look for — the hint is shown in the answer key and in the weak-patterns list,
so it is doing real teaching work.

## Things that are deliberate, not oversights

- `store.js` guards every `localStorage` access in try/catch. Private windows and
  blocked site data make it throw, not merely return nothing.
- Progress is an append-only attempt log. That is what makes cross-device merge a
  set union keyed by `(id, timestamp)` with nothing to resolve. Do not "optimise"
  it into a per-exercise summary.
- Tier readiness requires the threshold on **both** dimensions independently.
  Averaging them would hide exactly the weakness the tool exists to surface.
- The sticky header has no `backdrop-filter`. It had one; it made Chrome's
  screenshot path hang. Not worth it.
