# Read Code Trainer

A personal trainer for one specific skill: reading code an agent just wrote and
correctly judging whether it will run, and whether it does what was actually asked.

It is not a "learn Python" course. You never write code here — you read it, commit
to a verdict in writing, and then find out.

Full design rationale: [`read-code-trainer-spec.md`](read-code-trainer-spec.md).

## The loop

1. A snippet appears, framed as *an agent just built this for you*, alongside the
   ask it was supposedly built from.
2. You write out what it does, where it breaks, and what does not match the ask.
3. You commit to two verdicts: **will it run?** and **does it match the ask?**
4. Reveal the key. Both verdicts are scored separately, because they are different
   instincts that fail in different ways.
5. Mark honestly which defects you actually named. That is what steers your
   review sessions, so flattering it only wastes your own time.
6. Optionally press **Run it and see** — Python executes in the browser so you can
   watch the traceback you predicted (or did not).

## Tiers

| Tier | Trains |
|------|--------|
| 1 | **Sequence tracing.** Straight-line code, nothing wrong. Can you follow control flow? |
| 2 | **One obvious bug.** A single clear runtime defect, minimal framing. |
| 3 | **One bug, real stakes.** Same defects inside a business process. |
| 4 | **Mixed bugs.** 2–4 at once, runtime and logic together. What agent output actually looks like. |
| 5 | **Clean but wrong.** Runs fine, looks reasonable, does not do what was asked. |

A tier opens once you get **4 of your last 5** right on *both* dimensions in the
tier below. Both, not the average — a strong runtime instinct papering over a weak
logic one is precisely the conflation this tool exists to prevent. Readiness is a
rolling window, so it can close again if your recent form drops.

Locked tiers are marked but still selectable. It is your tool.

## Running it

Any static file server works. There is no build step.

```sh
python -m http.server 8765      # then open http://localhost:8765
```

## Hosting it on GitHub Pages

```sh
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
It appears at `https://<you>.github.io/<repo>/` within a minute or two. The
`.nojekyll` file is already here so GitHub serves the directories as-is.

## Progress, and carrying it between machines

Progress always lives in the browser you are using. It is an append-only log of
attempts, which is what makes merging two devices a plain set union with no
conflict to resolve.

Three ways to move it:

**Nothing.** One machine, one browser. It just works, and clearing site data loses it.

**Export / Import.** Progress tab → export a JSON file, import it elsewhere.
Importing merges rather than overwrites, so nothing already done is lost.

**GitHub sync.** Progress tab → *Set up GitHub sync*. Progress is pulled on load
and pushed after each attempt, so the same history follows you everywhere.

For sync you need a **fine-grained** personal access token from
[github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens/new),
scoped to **only this repository**, with **Contents: read and write** and nothing
else. The token is stored in that browser's local storage and is sent only to
`api.github.com`.

Two things worth knowing before you turn it on:

- **If the repo is public, so is `progress.json`.** It holds exercise ids,
  timestamps and right/wrong marks — nothing sensitive — but if you would rather it
  were not public, point the path at a separate private repo.
- **A token in local storage is a real credential.** Scoped to one repo, the worst
  case is someone scribbling on this repo. Revoke it if you lose the device.

## Adding more exercises

Fifty is a few weeks of sessions, not a lifetime. The pool is meant to grow: open
this repo in Claude Code and ask for another batch. Check the **Progress** tab
first — the patterns at the top of *"Patterns you keep missing"* are what the next
batch should be weighted toward.

Exercises live in `data/tier1.js` … `data/tier5.js`, and the bug pattern library
they draw on is `data/patterns.js`.

### Never ship an unverified batch

An exercise with a wrong answer key actively teaches the wrong instinct, which is
worse than having no exercise at all. Two checks guard against that, and both must
pass before anything is committed:

```sh
node tools/verify.mjs     # runs every snippet through real Python, checks each key
node tools/selftest.mjs   # progression rules, storage, merge, content integrity
```

`verify.mjs` executes each snippet and fails if the key claims a crash that does
not happen, or claims clean when Python raises. It also enforces the tier
contracts — tier 1 has no bugs, tier 5 never crashes, tier 4 carries at least one
runtime *and* one logic defect — and warns when a key names an exception Python
did not actually raise. Run a single exercise with `node tools/verify.mjs t4-07`.

## Layout

```
index.html            the whole UI
css/style.css         light and dark, no framework
data/patterns.js      the bug pattern library, with a hint per pattern
data/tier1-5.js       the exercises and their answer keys
js/store.js           progress: localStorage, plus optional GitHub sync
js/stats.js           tier readiness, weak patterns, what to show next
js/runner.js          lazy-loaded Pyodide, so snippets can actually run
js/app.js             wiring
tools/verify.mjs      executes every snippet, checks every key
tools/selftest.mjs    headless tests for progression, storage and content
```

No dependencies, no build, no package.json. Everything except the Python runtime
works offline; Pyodide is fetched from a CDN the first time you press *Run it*
(~10 MB, once).
