// Runs every exercise snippet through Python and checks the answer key against
// what actually happens. Catches the one failure mode this project cannot
// tolerate: a trainer that teaches you the wrong answer.
//
//   node tools/verify.mjs          check everything
//   node tools/verify.mjs t4       check one tier
//   node tools/verify.mjs t4-07    check one exercise
//
// Exit code is non-zero if any exercise disagrees with reality.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIERS = [1, 2, 3, 4, 5];
const PYTHON = process.env.PYTHON || "python";

// --- load the data files the same way the browser does -----------------------
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, "data", "patterns.js"), "utf8"), sandbox);
for (const t of TIERS) {
  vm.runInContext(readFileSync(join(ROOT, "data", `tier${t}.js`), "utf8"), sandbox);
}
const exercises = sandbox.window.EXERCISES;
const patterns = sandbox.window.PATTERNS;

const filter = process.argv[2];
const selected = filter
  ? exercises.filter((e) => e.id === filter || e.id.startsWith(filter))
  : exercises;

if (!selected.length) {
  console.error(`No exercises match "${filter}".`);
  process.exit(2);
}

// --- run each snippet --------------------------------------------------------
const work = mkdtempSync(join(tmpdir(), "rct-"));
const problems = [];
const warnings = [];

function runSnippet(code) {
  const file = join(work, "snippet.py");
  writeFileSync(file, code, "utf8");
  try {
    const stdout = execFileSync(PYTHON, [file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    });
    return { crashed: false, stdout, stderr: "" };
  } catch (err) {
    if (err.code === "ETIMEDOUT") return { crashed: true, stdout: "", stderr: "TIMEOUT", timeout: true };
    return { crashed: true, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
}

function exceptionName(stderr) {
  const lines = stderr.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Interrupt))\b/);
    if (m) return m[1];
  }
  return null;
}

console.log(`Verifying ${selected.length} exercise(s) with ${PYTHON}\n`);

for (const ex of selected) {
  const expected = ex.key.runtime.crashes;
  const result = runSnippet(ex.code);
  const ok = result.crashed === expected;

  // --- structural checks, independent of execution ---
  const ids = [];
  if (!ex.scenario || !ex.ask) ids.push("missing scenario or ask");
  if (!ex.key.trace?.length) ids.push("empty trace");
  if (!ex.key.stakes) ids.push("missing stakes note");
  if (ex.tier === 1 && ex.bugs.length) ids.push("tier 1 must have no bugs");
  if (ex.tier === 1 && ex.key.logic.matches !== true) ids.push("tier 1 must match its ask");
  if (ex.tier === 5 && expected) ids.push("tier 5 must not crash");
  if (ex.tier >= 2 && ex.tier <= 4 && !ex.bugs.length) ids.push("no bugs listed");
  if (ex.tier === 4) {
    const kinds = new Set(ex.bugs.map((b) => b.kind));
    if (!kinds.has("runtime") || !kinds.has("logic")) {
      ids.push("tier 4 needs at least one runtime and one logic bug");
    }
  }
  for (const b of ex.bugs) {
    if (!patterns[b.tag]) ids.push(`unknown pattern tag "${b.tag}"`);
    else if (patterns[b.tag].kind !== "both" && patterns[b.tag].kind !== b.kind) {
      warnings.push(`${ex.id}: "${b.tag}" is a ${patterns[b.tag].kind} pattern but tagged ${b.kind} here`);
    }
    if (!b.what) ids.push(`bug "${b.tag}" has no description`);
  }
  if (expected && !ex.key.runtime.where) ids.push("crashes but no location given");

  // --- does the named exception match what Python actually raised? ---
  if (result.crashed && !result.timeout) {
    const actual = exceptionName(result.stderr);
    const claimed = ex.key.runtime.why || "";
    if (actual && !claimed.includes(actual)) {
      warnings.push(`${ex.id}: raises ${actual}, but the key's explanation does not mention it`);
    }
  }

  if (ok && !ids.length) {
    const tail = result.crashed ? exceptionName(result.stderr) : "clean";
    console.log(`  ok    ${ex.id}  (${tail})`);
  } else {
    const detail = [];
    if (!ok) {
      detail.push(
        expected
          ? `key says it crashes, but it ran clean`
          : `key says it runs clean, but it raised ${exceptionName(result.stderr) || "something"}`
      );
      if (result.stderr) detail.push(result.stderr.trim().split(/\r?\n/).slice(-3).join("\n         "));
    }
    detail.push(...ids);
    console.log(`  FAIL  ${ex.id}`);
    for (const d of detail) console.log(`         ${d}`);
    problems.push(ex.id);
  }
}

rmSync(work, { recursive: true, force: true });

// --- coverage report ---------------------------------------------------------
if (!filter) {
  const used = new Set(exercises.flatMap((e) => e.bugs.map((b) => b.tag)));
  const unused = Object.keys(patterns).filter((p) => !used.has(p));
  console.log(`\nTiers: ${TIERS.map((t) => `${t}=${exercises.filter((e) => e.tier === t).length}`).join("  ")}`);
  console.log(`Patterns covered: ${used.size}/${Object.keys(patterns).length}`);
  if (unused.length) console.log(`Not yet used: ${unused.join(", ")}`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (problems.length) {
  console.log(`\n${problems.length} exercise(s) disagree with reality: ${problems.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${selected.length} exercise(s) verified.`);
