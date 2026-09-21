// Turning the attempt log into the three things the spec actually asks for:
// per-tier accuracy split by dimension, a "ready for the next tier" flag, and a
// running list of the bug patterns you keep missing.

(function () {
  "use strict";

  var ROLLING = 5; // how many recent attempts the readiness check looks at
  var NEEDED = 4; // how many of those must be right, on both dimensions
  var MAX_TIER = 5;

  function byTier(progress, tier) {
    return progress.attempts.filter(function (a) {
      return a.tier === tier;
    });
  }

  function tierStats(progress, tier) {
    var all = byTier(progress, tier);
    var recent = all.slice(-ROLLING);
    var runtimeRecent = recent.filter(function (a) { return a.runtimeCorrect; }).length;
    var logicRecent = recent.filter(function (a) { return a.logicCorrect; }).length;
    return {
      tier: tier,
      attempts: all.length,
      runtimeCorrect: all.filter(function (a) { return a.runtimeCorrect; }).length,
      logicCorrect: all.filter(function (a) { return a.logicCorrect; }).length,
      recent: recent.length,
      runtimeRecent: runtimeRecent,
      logicRecent: logicRecent,
      // Both dimensions must clear the bar. Averaging them would let a strong
      // runtime instinct paper over a weak logic one, which is the exact
      // conflation this tool exists to avoid.
      ready: recent.length >= ROLLING && runtimeRecent >= NEEDED && logicRecent >= NEEDED,
    };
  }

  // Tier 1 is always open. Each tier above it opens once the one below is clear.
  function unlockedTier(progress) {
    var t = 1;
    while (t < MAX_TIER && tierStats(progress, t).ready) t++;
    return t;
  }

  function seenIds(progress) {
    var set = Object.create(null);
    progress.attempts.forEach(function (a) {
      set[a.id] = (set[a.id] || 0) + 1;
    });
    return set;
  }

  // For each bug pattern: how often it has appeared in something you attempted,
  // and how often you failed to name it.
  function patternStats(progress, exercises) {
    var byId = Object.create(null);
    exercises.forEach(function (e) { byId[e.id] = e; });

    var acc = Object.create(null);
    progress.attempts.forEach(function (a) {
      var ex = byId[a.id];
      if (!ex) return; // an exercise that has since been removed from the bank
      ex.bugs.forEach(function (b) {
        var s = acc[b.tag] || (acc[b.tag] = { tag: b.tag, seen: 0, missed: 0 });
        s.seen++;
        if (!(a.caught && a.caught[b.tag])) s.missed++;
      });
    });

    return Object.keys(acc)
      .map(function (k) {
        var s = acc[k];
        s.rate = s.seen ? s.missed / s.seen : 0;
        return s;
      })
      .sort(function (x, y) {
        // Most-missed first, and among equals the one you have met more often —
        // a pattern missed 3 of 4 times is a firmer signal than 1 of 1.
        return y.rate - x.rate || y.seen - x.seen;
      });
  }

  // Patterns worth weighting a review session toward: met at least twice and
  // missed more often than not.
  function weakPatterns(progress, exercises) {
    return patternStats(progress, exercises).filter(function (s) {
      return s.seen >= 2 && s.rate > 0.5;
    });
  }

  // Choose what to show next.
  //   mode "practice" — anything in the tier, unseen first
  //   mode "review"   — prefer exercises carrying a pattern you keep missing
  function pickNext(exercises, progress, opts) {
    var tier = opts.tier;
    var mode = opts.mode || "practice";
    var avoidId = opts.avoidId;
    var seen = seenIds(progress);
    var pool = exercises.filter(function (e) {
      return e.tier === tier && e.id !== avoidId;
    });
    if (!pool.length) return null;

    var weak = Object.create(null);
    if (mode === "review") {
      weakPatterns(progress, exercises).forEach(function (s) { weak[s.tag] = s.rate; });
    }

    function score(e) {
      var times = seen[e.id] || 0;
      // Unseen work is worth far more than a repeat; repeats decay further the
      // more often you have had them.
      var s = times === 0 ? 1000 : 100 / (times + 1);
      if (mode === "review") {
        e.bugs.forEach(function (b) {
          if (weak[b.tag]) s += 400 * weak[b.tag];
        });
      }
      return s + Math.random() * 40; // break ties differently each session
    }

    return pool.reduce(function (best, e) {
      return score(e) > score(best) ? e : best;
    }, pool[0]);
  }

  function overall(progress) {
    var n = progress.attempts.length;
    return {
      attempts: n,
      runtimeCorrect: progress.attempts.filter(function (a) { return a.runtimeCorrect; }).length,
      logicCorrect: progress.attempts.filter(function (a) { return a.logicCorrect; }).length,
    };
  }

  window.Stats = {
    ROLLING: ROLLING,
    NEEDED: NEEDED,
    MAX_TIER: MAX_TIER,
    tierStats: tierStats,
    unlockedTier: unlockedTier,
    seenIds: seenIds,
    patternStats: patternStats,
    weakPatterns: weakPatterns,
    pickNext: pickNext,
    overall: overall,
  };
})();
