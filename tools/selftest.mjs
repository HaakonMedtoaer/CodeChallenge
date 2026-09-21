// Headless checks for the parts that decide what you see next and when a tier
// opens. These run without a browser, so a mistake in the progression rules
// surfaces here rather than three sessions into using the thing.
//
//   node tools/selftest.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- a browser-ish sandbox ---------------------------------------------------
const mem = new Map();
const sandbox = {
  window: {},
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
  setTimeout,
  clearTimeout,
  fetch: () => Promise.reject(new Error("no network in selftest")),
  TextEncoder,
  TextDecoder,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  console,
};
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);

for (const f of ["data/patterns.js", "data/tier1.js", "data/tier2.js", "data/tier3.js",
                 "data/tier4.js", "data/tier5.js", "js/store.js", "js/stats.js"]) {
  vm.runInContext(readFileSync(join(ROOT, f), "utf8"), sandbox);
}

const { EXERCISES, PATTERNS, Store, mergeProgress } = sandbox.window;
const S = sandbox.window.Stats;

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? "\n         " + detail : ""}`);
    failures++;
  }
}

function attempt(id, tier, runtimeCorrect, logicCorrect, caught, at) {
  return { id, tier, at: at || new Date(Date.now() + Math.random() * 1000).toISOString(),
           runtimeCorrect, logicCorrect, caught: caught || {} };
}

console.log("Progression rules\n");

// --- tier unlocking ---
{
  const p = { version: 1, attempts: [] };
  check("tier 1 is open with no history", S.unlockedTier(p) === 1);

  for (let i = 0; i < 4; i++) p.attempts.push(attempt("t1-0" + (i + 1), 1, true, true));
  check("4 perfect attempts is not yet enough", S.unlockedTier(p) === 1,
        `rolling window is ${S.ROLLING}, so 4 should not clear it`);

  p.attempts.push(attempt("t1-05", 1, true, true));
  check("5 perfect attempts opens tier 2", S.unlockedTier(p) === 2);
}

// --- both dimensions must clear, not the average ---
{
  const p = { version: 1, attempts: [] };
  for (let i = 0; i < 5; i++) p.attempts.push(attempt("t1-0" + (i + 1), 1, true, false));
  const st = S.tierStats(p, 1);
  check("perfect runtime with zero logic does NOT clear a tier", !st.ready,
        `runtimeRecent=${st.runtimeRecent} logicRecent=${st.logicRecent} ready=${st.ready}`);

  const q = { version: 1, attempts: [] };
  for (let i = 0; i < 4; i++) q.attempts.push(attempt("t1-0" + (i + 1), 1, true, true));
  q.attempts.push(attempt("t1-05", 1, false, true));
  check("4 of the last 5 on both dimensions clears it", S.tierStats(q, 1).ready);
}

// --- rolling window really is rolling ---
{
  const p = { version: 1, attempts: [] };
  for (let i = 0; i < 5; i++) p.attempts.push(attempt("t2-0" + (i + 1), 2, true, true));
  check("tier 2 clear after 5 right", S.tierStats(p, 2).ready);
  for (let i = 0; i < 5; i++) p.attempts.push(attempt("t2-0" + (i + 6), 2, false, false));
  check("a run of wrong answers closes it again", !S.tierStats(p, 2).ready,
        "readiness must reflect recent form, not a high-water mark");
}

// --- weak patterns ---
{
  const ex = EXERCISES.find((e) => e.bugs.length > 0);
  const tag = ex.bugs[0].tag;
  const p = { version: 1, attempts: [] };
  for (let i = 0; i < 3; i++) p.attempts.push(attempt(ex.id, ex.tier, true, true, {}));
  const weak = S.weakPatterns(p, EXERCISES);
  check("a repeatedly missed pattern surfaces as weak",
        weak.some((w) => w.tag === tag), `expected ${tag} in [${weak.map((w) => w.tag)}]`);

  const q = { version: 1, attempts: [] };
  const allCaught = {};
  ex.bugs.forEach((b) => { allCaught[b.tag] = true; });
  for (let i = 0; i < 3; i++) q.attempts.push(attempt(ex.id, ex.tier, true, true, allCaught));
  check("a pattern you always name is not weak", S.weakPatterns(q, EXERCISES).length === 0);
}

// --- pickNext ---
{
  const p = { version: 1, attempts: [] };
  const picked = new Set();
  const tier = 3;
  const poolSize = EXERCISES.filter((e) => e.tier === tier).length;
  for (let i = 0; i < poolSize; i++) {
    const ex = S.pickNext(EXERCISES, p, { tier, mode: "practice" });
    picked.add(ex.id);
    p.attempts.push(attempt(ex.id, tier, true, true));
  }
  check(`practice mode works through all ${poolSize} of tier ${tier} before repeating`,
        picked.size === poolSize, `only saw ${picked.size} distinct`);

  const ex = S.pickNext(EXERCISES, p, { tier, mode: "practice" });
  check("it still returns something once the tier is exhausted", !!ex);

  const avoid = ex.id;
  const next = S.pickNext(EXERCISES, p, { tier, mode: "practice", avoidId: avoid });
  check("skipping never hands back the same exercise", next.id !== avoid);
}

// --- review mode aims at weak spots ---
{
  const p = { version: 1, attempts: [] };
  // Miss every defect in one tier-4 exercise repeatedly, then ask for review.
  const target = EXERCISES.find((e) => e.tier === 4);
  for (let i = 0; i < 4; i++) p.attempts.push(attempt(target.id, 4, true, true, {}));
  const weakTags = new Set(S.weakPatterns(p, EXERCISES).map((w) => w.tag));
  let hits = 0;
  for (let i = 0; i < 30; i++) {
    const pick = S.pickNext(EXERCISES, p, { tier: 4, mode: "review" });
    if (pick.bugs.some((b) => weakTags.has(b.tag))) hits++;
  }
  check("review mode mostly serves exercises carrying weak patterns", hits >= 24,
        `${hits}/30 picks carried a weak pattern`);
}

console.log("\nStorage\n");

// --- merge is a union, and idempotent ---
{
  const a = { version: 1, attempts: [attempt("t1-01", 1, true, true, {}, "2026-01-01T00:00:00Z")] };
  const b = { version: 1, attempts: [attempt("t1-02", 1, true, true, {}, "2026-01-02T00:00:00Z")] };
  check("merging two devices keeps both histories", mergeProgress(a, b).attempts.length === 2);
  check("merging the same thing twice adds nothing", mergeProgress(a, a).attempts.length === 1);
  const merged = mergeProgress(a, b);
  check("merge is stable under repetition", mergeProgress(merged, merged).attempts.length === 2);
  check("merged attempts come back in time order",
        mergeProgress(b, a).attempts[0].id === "t1-01");
}

// --- the store round-trips through localStorage ---
{
  mem.clear();
  const s1 = new Store();
  s1.record(attempt("t1-01", 1, true, false));
  s1.record(attempt("t1-02", 1, false, true));
  const s2 = new Store();
  check("a reload sees what the last session logged", s2.progress.attempts.length === 2);

  const text = s2.exportJSON();
  mem.clear();
  const s3 = new Store();
  check("a fresh browser starts empty", s3.progress.attempts.length === 0);
  const added = s3.importJSON(text);
  check("import brings it back", added === 2 && s3.progress.attempts.length === 2);
  check("importing the same file twice changes nothing", s3.importJSON(text) === 0);
  check("sync is off until configured", s3.syncEnabled() === false);
}

// --- localStorage refusing to work must not take the app down ---
{
  mem.clear();
  const realSet = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => { throw new Error("blocked"); };
  let threw = null;
  try {
    const s = new Store();
    s.record(attempt("t1-01", 1, true, true));
  } catch (e) { threw = e; }
  sandbox.localStorage.setItem = realSet;
  check("a browser that blocks storage does not crash the app", threw === null,
        threw ? String(threw) : "");
}

console.log("\nContent\n");

// --- data integrity the verify script does not cover ---
{
  const ids = EXERCISES.map((e) => e.id);
  check("every exercise id is unique", new Set(ids).size === ids.length);
  check("every exercise has code and a key",
        EXERCISES.every((e) => e.code && e.key && e.key.runtime && e.key.logic));
  check("every bug tag exists in the pattern library",
        EXERCISES.every((e) => e.bugs.every((b) => PATTERNS[b.tag])));
  check("tier 5 never crashes", EXERCISES.filter((e) => e.tier === 5).every((e) => !e.key.runtime.crashes));
  check("tier 1 is always clean",
        EXERCISES.filter((e) => e.tier === 1).every((e) => !e.bugs.length && e.key.logic.matches));
  check("every tier has at least 5 exercises",
        [1, 2, 3, 4, 5].every((t) => EXERCISES.filter((e) => e.tier === t).length >= 5));
}

console.log(failures ? `\n${failures} check(s) failed.` : `\nAll checks passed.`);
process.exit(failures ? 1 : 0);
