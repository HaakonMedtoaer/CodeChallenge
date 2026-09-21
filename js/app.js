// Read Code Trainer — wiring.
//
// The loop: read the code, commit to two verdicts in writing, reveal the key,
// mark honestly which defects you actually named, log it, move on.

(function () {
  "use strict";

  var EXERCISES = window.EXERCISES || [];
  var PATTERNS = window.PATTERNS || {};
  var S = window.Stats;

  var TIERS = [
    { n: 1, name: "Sequence tracing", blurb: "Straight-line code with nothing wrong. Can you follow the control flow without second-guessing yourself?" },
    { n: 2, name: "One obvious bug", blurb: "A single clear runtime defect and nothing else. Building the pattern library in your head." },
    { n: 3, name: "One bug, real stakes", blurb: "The same defects inside a business process, so the consequences come into focus alongside the spot." },
    { n: 4, name: "Mixed bugs", blurb: "Two to four defects at once, runtime and logic together. This is what agent output actually looks like." },
    { n: 5, name: "Clean but wrong", blurb: "It runs. It looks reasonable. It does not do what was asked. No crash to catch — only judgement." },
  ];

  var el = function (id) { return document.getElementById(id); };
  var store = new window.Store();

  var current = null;      // the exercise on screen
  var revealed = false;
  var caught = {};         // tag -> did you name it
  var pendingAdvance = 0;  // tier newly unlocked by the last attempt

  // ------------------------------------------------------------------ theme
  function initTheme() {
    var saved;
    try { saved = localStorage.getItem("rct.theme"); } catch (e) { saved = null; }
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    el("theme-toggle").addEventListener("click", function () {
      var now = document.documentElement.getAttribute("data-theme");
      var isDark = now === "dark" ||
        (now !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("rct.theme", next); } catch (e) { /* not important enough to care */ }
    });
  }

  // ------------------------------------------------------------------- nav
  function showView(which) {
    el("view-practice").hidden = which !== "practice";
    el("view-progress").hidden = which !== "progress";
    el("nav-practice").classList.toggle("is-active", which === "practice");
    el("nav-progress").classList.toggle("is-active", which === "progress");
    if (which === "progress") renderProgress();
  }

  // -------------------------------------------------------------- exercise
  function tierOf(n) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].n === n) return TIERS[i];
    return TIERS[0];
  }

  function buildTierSelect() {
    var sel = el("tier-select");
    var unlocked = S.unlockedTier(store.progress);
    var keep = sel.value;
    sel.innerHTML = "";
    TIERS.forEach(function (t) {
      var o = document.createElement("option");
      o.value = String(t.n);
      o.textContent = "Tier " + t.n + " — " + t.name + (t.n > unlocked ? "  (not unlocked yet)" : "");
      sel.appendChild(o);
    });
    sel.value = keep || String(unlocked);
  }

  function currentTier() {
    return parseInt(el("tier-select").value, 10) || 1;
  }

  function loadExercise(avoidId) {
    var tier = currentTier();
    var mode = el("mode-select").value;
    el("tier-blurb").textContent = tierOf(tier).blurb;

    var pool = EXERCISES.filter(function (e) { return e.tier === tier; });
    var seen = S.seenIds(store.progress);
    var unseen = pool.filter(function (e) { return !seen[e.id]; });
    el("empty-pool").hidden = unseen.length > 0 || pool.length === 0;

    var ex = S.pickNext(EXERCISES, store.progress, { tier: tier, mode: mode, avoidId: avoidId });
    if (!ex) return;
    current = ex;
    revealed = false;
    caught = {};
    pendingAdvance = 0;

    el("ex-id").textContent = ex.id;
    el("ex-scenario").textContent = ex.scenario;
    el("ex-ask").textContent = ex.ask;
    el("ex-code").textContent = ex.code;

    el("notes").value = "";
    Array.prototype.forEach.call(
      document.querySelectorAll('input[name="runtime"], input[name="logic"]'),
      function (r) { r.checked = false; }
    );
    el("answer-card").hidden = false;
    el("key-card").hidden = true;
    el("done-card").hidden = true;
    el("run-output").hidden = true;
    el("run-output").textContent = "";
    el("run-status").textContent = "";
    el("run-btn").disabled = false;
    updateRevealButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chosen(name) {
    var r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : null;
  }

  function updateRevealButton() {
    var ready = !!chosen("runtime") && !!chosen("logic");
    el("reveal-btn").disabled = !ready;
    el("reveal-hint").textContent = ready
      ? "Once revealed, this one counts — the verdicts above are locked in."
      : "Pick both verdicts to continue.";
  }

  // ---------------------------------------------------------------- reveal
  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    var k = current.key;

    var runtimeSaid = chosen("runtime") === "crash";
    var logicSaid = chosen("logic") === "match";
    var runtimeRight = runtimeSaid === k.runtime.crashes;
    var logicRight = logicSaid === k.logic.matches;

    setScorecard("score-runtime", runtimeRight,
      k.runtime.crashes ? "It raises and halts." : "It runs to completion.",
      runtimeRight ? "Right" : "Not this time");
    setScorecard("score-logic", logicRight,
      k.logic.matches ? "It does match the ask." : "It does not match the ask.",
      logicRight ? "Right" : "Not this time");

    var trace = el("key-trace");
    trace.innerHTML = "";
    k.trace.forEach(function (step) {
      var li = document.createElement("li");
      li.textContent = step;
      trace.appendChild(li);
    });

    el("key-runtime").textContent = k.runtime.crashes
      ? "Crashes at " + k.runtime.where + ". " + k.runtime.why
      : k.runtime.why;
    el("key-logic").textContent = k.logic.note;
    el("key-stakes").textContent = k.stakes;

    renderBugs();

    el("key-card").hidden = false;
    el("key-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setScorecard(id, right, detail, mark) {
    var card = el(id);
    card.classList.toggle("is-right", right);
    card.classList.toggle("is-wrong", !right);
    card.querySelector(".scorecard-mark").textContent = mark;
    card.querySelector(".scorecard-detail").textContent = detail;
  }

  function renderBugs() {
    var list = el("key-bugs");
    list.innerHTML = "";
    if (!current.bugs.length) {
      el("bugs-block").hidden = true;
      return;
    }
    el("bugs-block").hidden = false;

    current.bugs.forEach(function (b, i) {
      var p = PATTERNS[b.tag] || { label: b.tag, hint: "", kind: b.kind };
      var li = document.createElement("li");

      var head = document.createElement("div");
      head.className = "bug-head";

      var label = document.createElement("label");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.id = "bug-" + i;
      box.addEventListener("change", function () { caught[b.tag] = box.checked; });
      var text = document.createElement("span");
      text.textContent = "I named this one";
      label.appendChild(box);
      label.appendChild(text);

      var name = document.createElement("strong");
      name.textContent = p.label;

      var tag = document.createElement("span");
      tag.className = "kind-tag kind-" + b.kind;
      tag.textContent = b.kind;

      head.appendChild(label);
      head.appendChild(name);
      head.appendChild(tag);
      li.appendChild(head);

      var what = document.createElement("p");
      what.className = "bug-what";
      what.textContent = b.what;
      li.appendChild(what);

      if (p.hint) {
        var hint = document.createElement("p");
        hint.className = "bug-hint";
        hint.textContent = p.hint;
        li.appendChild(hint);
      }

      list.appendChild(li);
    });
  }

  // ----------------------------------------------------------------- python
  function runIt() {
    var btn = el("run-btn");
    var status = el("run-status");
    var out = el("run-output");
    btn.disabled = true;
    status.textContent = window.Runner.isLoaded() ? "Running…" : "Loading Python…";

    window.Runner.run(current.code, function (msg) { status.textContent = msg; })
      .then(function (res) {
        var text = res.stdout || "";
        if (res.error) text += (text ? "\n\n" : "") + res.error;
        out.textContent = text || "(the snippet produced no output)";
        out.hidden = false;
        status.textContent = res.error ? "Raised — halted here." : "Ran to completion.";
        btn.disabled = false;
      })
      .catch(function (err) {
        out.textContent = String(err.message || err);
        out.hidden = false;
        status.textContent = "";
        btn.disabled = false;
      });
  }

  // ------------------------------------------------------------------- log
  function logAttempt() {
    if (!current || !revealed) return;
    var k = current.key;
    var before = S.unlockedTier(store.progress);

    store.record({
      id: current.id,
      tier: current.tier,
      at: new Date().toISOString(),
      runtimeCorrect: (chosen("runtime") === "crash") === k.runtime.crashes,
      logicCorrect: (chosen("logic") === "match") === k.logic.matches,
      caught: current.bugs.reduce(function (acc, b) {
        acc[b.tag] = !!caught[b.tag];
        return acc;
      }, {}),
      notes: el("notes").value.slice(0, 2000),
    });

    var after = S.unlockedTier(store.progress);
    buildTierSelect();

    if (after > before && after > currentTier()) {
      pendingAdvance = after;
      el("answer-card").hidden = true;
      el("key-card").hidden = true;
      el("done-card").hidden = false;
      el("done-text").textContent =
        "That is " + S.NEEDED + " of your last " + S.ROLLING + " right on both the runtime and the logic call in tier " +
        currentTier() + ". Tier " + after + " — " + tierOf(after).name.toLowerCase() +
        " — is open whenever you want it. There is no rush; staying put and building the habit is a perfectly good answer.";
      el("done-card").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    loadExercise(current.id);
  }

  // -------------------------------------------------------------- progress
  function renderProgress() {
    el("rolling-n").textContent = String(S.ROLLING);
    var unlocked = S.unlockedTier(store.progress);
    var body = el("tier-table").querySelector("tbody");
    body.innerHTML = "";

    TIERS.forEach(function (t) {
      var st = S.tierStats(store.progress, t.n);
      var tr = document.createElement("tr");
      if (t.n === unlocked) tr.className = "is-current";
      else if (t.n > unlocked) tr.className = "is-locked";

      function cell(html, cls) {
        var td = document.createElement("td");
        if (cls) td.className = cls;
        td.innerHTML = html;
        return td;
      }

      tr.appendChild(cell("Tier " + t.n + (st.ready ? '<span class="ready-pill">clear</span>' : ""), "tier-name"));
      tr.appendChild(cell("<strong>" + t.name + "</strong><br><span class='tier-desc'>" + t.blurb + "</span>"));
      tr.appendChild(cell(String(st.attempts)));
      tr.appendChild(cell(pct(st.runtimeCorrect, st.attempts)));
      tr.appendChild(cell(pct(st.logicCorrect, st.attempts)));
      tr.appendChild(cell(
        st.recent
          ? "runtime " + st.runtimeRecent + "/" + st.recent + "<br>logic " + st.logicRecent + "/" + st.recent
          : "—"
      ));
      body.appendChild(tr);
    });

    renderWeak();
    renderSyncState();
    var n = S.overall(store.progress).attempts;
    el("footer-count").textContent =
      EXERCISES.length + " exercises · " + n + " attempt" + (n === 1 ? "" : "s") + " logged";
  }

  function pct(n, total) {
    if (!total) return "—";
    return Math.round((n / total) * 100) + "%<br><span class='tier-desc'>" + n + "/" + total + "</span>";
  }

  function renderWeak() {
    var host = el("weak-list");
    host.innerHTML = "";
    var all = S.patternStats(store.progress, EXERCISES);

    if (!all.length) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing to show yet — work through a few exercises and the patterns you keep missing will collect here.";
      host.appendChild(p);
      return;
    }

    var missed = all.filter(function (s) { return s.missed > 0; });
    if (!missed.length) {
      var q = document.createElement("p");
      q.className = "hint";
      q.textContent = "You have named every defect you have met so far. Nothing to weight review sessions toward yet.";
      host.appendChild(q);
      return;
    }

    missed.forEach(function (s) {
      var meta = PATTERNS[s.tag] || { label: s.tag, hint: "" };
      var row = document.createElement("div");
      row.className = "weak-row";

      var name = document.createElement("div");
      name.className = "weak-name";
      name.textContent = meta.label;
      var hint = document.createElement("p");
      hint.className = "weak-hint";
      hint.textContent = meta.hint || "";
      var namecol = document.createElement("div");
      namecol.style.minWidth = "190px";
      namecol.appendChild(name);
      namecol.appendChild(hint);

      var bar = document.createElement("div");
      bar.className = "weak-bar";
      var fill = document.createElement("span");
      fill.style.width = Math.round(s.rate * 100) + "%";
      bar.appendChild(fill);

      var count = document.createElement("div");
      count.className = "weak-count";
      count.textContent = "missed " + s.missed + " of " + s.seen;

      row.appendChild(namecol);
      row.appendChild(bar);
      row.appendChild(count);
      host.appendChild(row);
    });
  }

  // ------------------------------------------------------------------ sync
  function badgeFor(status) {
    if (status === "local") return ["local", "badge-local"];
    if (status === "synced") return ["synced", "badge-synced"];
    if (status === "syncing") return ["syncing…", "badge-syncing"];
    if (status === "pending") return ["unsaved", "badge-pending"];
    if (status === "error") return ["sync failed", "badge-error"];
    return ["sync on", "badge-local"];
  }

  function renderBadge() {
    var b = badgeFor(store.status);
    var node = el("sync-badge");
    node.textContent = b[0];
    node.className = "badge " + b[1];
    node.title = store.lastError ||
      (store.syncEnabled() ? "Progress is mirrored to GitHub" : "Progress is stored in this browser only");
  }

  function renderSyncState() {
    var host = el("sync-state");
    host.innerHTML = "";
    var p = document.createElement("p");
    p.style.margin = "0";
    if (!store.syncEnabled()) {
      p.innerHTML = "Sync is <strong>off</strong>. Progress is stored in this browser only — clearing site data loses it.";
    } else {
      var c = store.config;
      p.innerHTML = "Syncing to <strong>" + esc(c.owner + "/" + c.repo) + "</strong> · <code>" +
        esc(c.path) + "</code> on <code>" + esc(c.branch || "main") + "</code>.";
      if (store.lastError) {
        var warn = document.createElement("p");
        warn.className = "form-msg is-bad";
        warn.textContent = store.lastError;
        host.appendChild(p);
        host.appendChild(warn);
        return;
      }
    }
    host.appendChild(p);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function loadSyncForm() {
    var c = store.config;
    if (!c) return;
    el("sync-owner").value = c.owner || "";
    el("sync-repo").value = c.repo || "";
    el("sync-branch").value = c.branch || "main";
    el("sync-path").value = c.path || "progress.json";
    el("sync-token").value = c.token || "";
  }

  function saveSync() {
    var msg = el("sync-msg");
    var cfg = {
      owner: el("sync-owner").value.trim(),
      repo: el("sync-repo").value.trim(),
      branch: el("sync-branch").value.trim() || "main",
      path: el("sync-path").value.trim() || "progress.json",
      token: el("sync-token").value.trim(),
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      msg.className = "form-msg is-bad";
      msg.textContent = "Owner, repository and token are all needed.";
      return;
    }
    store.setConfig(cfg);
    msg.className = "form-msg";
    msg.textContent = "Checking the token and pulling anything already stored…";
    store.pull().then(function () {
      if (store.status === "error") {
        msg.className = "form-msg is-bad";
        msg.textContent = store.lastError;
      } else {
        msg.className = "form-msg is-good";
        msg.textContent = "Synced. " + store.progress.attempts.length +
          " attempts are now held in both places.";
      }
      renderProgress();
    });
  }

  function clearSync() {
    store.setConfig(null);
    el("sync-token").value = "";
    var msg = el("sync-msg");
    msg.className = "form-msg";
    msg.textContent = "Sync is off and the token has been removed from this browser. Progress stays here.";
    renderProgress();
  }

  // -------------------------------------------------------------- transfer
  function exportProgress() {
    var blob = new Blob([store.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "read-code-trainer-progress.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say("transfer-msg", "Exported " + store.progress.attempts.length + " attempts.", "is-good");
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var added = store.importJSON(String(reader.result));
        say("transfer-msg",
          added ? "Merged in " + added + " attempt" + (added === 1 ? "" : "s") + " you did not already have."
                : "Nothing new in that file — it was already all here.",
          "is-good");
        renderProgress();
        buildTierSelect();
      } catch (err) {
        say("transfer-msg", err.message || String(err), "is-bad");
      }
    };
    reader.readAsText(file);
  }

  function say(id, text, cls) {
    var n = el(id);
    n.className = "form-msg " + (cls || "");
    n.textContent = text;
  }

  // ------------------------------------------------------------------ init
  function init() {
    initTheme();
    buildTierSelect();

    el("nav-practice").addEventListener("click", function () { showView("practice"); });
    el("nav-progress").addEventListener("click", function () { showView("progress"); });

    el("tier-select").addEventListener("change", function () { loadExercise(); });
    el("mode-select").addEventListener("change", function () { loadExercise(); });
    el("skip-btn").addEventListener("click", function () { loadExercise(current && current.id); });

    Array.prototype.forEach.call(
      document.querySelectorAll('input[name="runtime"], input[name="logic"]'),
      function (r) { r.addEventListener("change", updateRevealButton); }
    );

    el("reveal-btn").addEventListener("click", reveal);
    el("next-btn").addEventListener("click", logAttempt);
    el("run-btn").addEventListener("click", runIt);

    el("advance-btn").addEventListener("click", function () {
      el("tier-select").value = String(pendingAdvance);
      loadExercise();
    });
    el("stay-btn").addEventListener("click", function () { loadExercise(); });

    el("sync-save").addEventListener("click", saveSync);
    el("sync-clear").addEventListener("click", clearSync);
    el("export-btn").addEventListener("click", exportProgress);
    el("import-btn").addEventListener("click", function () { el("import-file").click(); });
    el("import-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importProgress(e.target.files[0]);
      e.target.value = "";
    });
    el("reset-btn").addEventListener("click", function () {
      if (!window.confirm("Erase every logged attempt on this device? This cannot be undone, and if sync is on it will clear the stored copy too.")) return;
      store.reset();
      buildTierSelect();
      renderProgress();
      say("transfer-msg", "Progress erased.", "");
    });

    store.onChange(function () {
      renderBadge();
      if (!el("view-progress").hidden) renderSyncState();
    });

    loadSyncForm();
    renderBadge();
    var n = S.overall(store.progress).attempts;
    el("footer-count").textContent =
      EXERCISES.length + " exercises · " + n + " attempt" + (n === 1 ? "" : "s") + " logged";

    // Pull first so a fresh device starts from the shared history, not from zero.
    if (store.syncEnabled()) {
      store.pull().then(function () {
        buildTierSelect();
        loadExercise();
      });
    } else {
      loadExercise();
    }

    // A queued push should not be lost to a closed tab.
    window.addEventListener("beforeunload", function () {
      if (store.status === "pending") store.push();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
