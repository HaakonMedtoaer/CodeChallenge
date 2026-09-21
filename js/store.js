// Progress storage.
//
// One interface, two backends. localStorage always runs and is the source of
// truth for this device. GitHub sync is optional: when configured, progress is
// pulled on load and pushed after each attempt, so the same history follows you
// between machines.
//
// The record is an append-only log of attempts. That shape is deliberate —
// merging two devices is a set union keyed by (exercise, timestamp), with no
// conflict resolution to get wrong.

(function () {
  "use strict";

  var LOCAL_KEY = "rct.progress.v1";
  var CONFIG_KEY = "rct.sync.v1";
  var PUSH_DEBOUNCE_MS = 4000;

  // --- utf-8 safe base64, because GitHub hands us base64 and our notes have ø --
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function emptyProgress() {
    return { version: 1, updatedAt: new Date().toISOString(), attempts: [] };
  }

  function attemptKey(a) {
    return a.id + "@" + a.at;
  }

  // Union by (exercise, timestamp). Two devices can only ever add attempts,
  // never contradict each other about one, so this needs no tie-breaking.
  function merge(a, b) {
    var seen = Object.create(null);
    var out = [];
    [a, b].forEach(function (src) {
      (src && src.attempts ? src.attempts : []).forEach(function (at) {
        var k = attemptKey(at);
        if (!seen[k]) {
          seen[k] = true;
          out.push(at);
        }
      });
    });
    out.sort(function (x, y) {
      return x.at < y.at ? -1 : x.at > y.at ? 1 : 0;
    });
    return { version: 1, updatedAt: new Date().toISOString(), attempts: out };
  }

  // --- local ----------------------------------------------------------------
  // Every read and write is guarded: private windows and blocked site data can
  // make localStorage throw rather than simply return nothing.
  function localLoad() {
    try {
      var raw = window.localStorage.getItem(LOCAL_KEY);
      if (!raw) return emptyProgress();
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.attempts)) return emptyProgress();
      return parsed;
    } catch (e) {
      return emptyProgress();
    }
  }
  function localSave(progress) {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
      return true;
    } catch (e) {
      return false;
    }
  }

  function configLoad() {
    try {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function configSave(cfg) {
    try {
      if (cfg) window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
      else window.localStorage.removeItem(CONFIG_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- github ---------------------------------------------------------------
  function ghUrl(cfg) {
    return (
      "https://api.github.com/repos/" +
      encodeURIComponent(cfg.owner) +
      "/" +
      encodeURIComponent(cfg.repo) +
      "/contents/" +
      cfg.path.split("/").map(encodeURIComponent).join("/")
    );
  }

  function ghHeaders(cfg) {
    return {
      Authorization: "Bearer " + cfg.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function ghPull(cfg) {
    var url = ghUrl(cfg) + "?ref=" + encodeURIComponent(cfg.branch || "main");
    return fetch(url, { headers: ghHeaders(cfg), cache: "no-store" }).then(function (res) {
      if (res.status === 404) return { progress: null, sha: null }; // not created yet
      if (res.status === 401 || res.status === 403) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(
            "GitHub rejected the token (" + res.status + "). " +
            (body && body.message ? body.message : "Check it has Contents: read and write on this repository.")
          );
        });
      }
      if (!res.ok) throw new Error("GitHub returned " + res.status + " reading progress.");
      return res.json().then(function (body) {
        var text = body.content ? b64decode(body.content) : "";
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error("The progress file in the repo is not valid JSON.");
        }
        return { progress: parsed, sha: body.sha };
      });
    });
  }

  function ghPush(cfg, progress, sha) {
    var body = {
      message: "progress: " + progress.attempts.length + " attempts",
      content: b64encode(JSON.stringify(progress, null, 2) + "\n"),
      branch: cfg.branch || "main",
    };
    if (sha) body.sha = sha;
    return fetch(ghUrl(cfg), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(cfg)),
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 409 || res.status === 422) {
        // Someone else wrote first. Pull, merge, and try once more.
        return ghPull(cfg).then(function (remote) {
          var merged = merge(progress, remote.progress || emptyProgress());
          return ghPush(cfg, merged, remote.sha).then(function (r) {
            return { sha: r.sha, progress: merged };
          });
        });
      }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          throw new Error("GitHub returned " + res.status + " saving progress. " + (b.message || ""));
        });
      }
      return res.json().then(function (b) {
        return { sha: b.content ? b.content.sha : null, progress: progress };
      });
    });
  }

  // --- the store ------------------------------------------------------------
  function Store() {
    this.progress = localLoad();
    this.config = configLoad();
    this.sha = null;
    this.status = this.config ? "idle" : "local";
    this.lastError = null;
    this._timer = null;
    this._listeners = [];
  }

  Store.prototype.onChange = function (fn) {
    this._listeners.push(fn);
  };
  Store.prototype._emit = function () {
    var self = this;
    this._listeners.forEach(function (fn) {
      fn(self);
    });
  };

  Store.prototype.syncEnabled = function () {
    return !!this.config;
  };

  Store.prototype.setConfig = function (cfg) {
    this.config = cfg;
    this.sha = null;
    configSave(cfg);
    this.status = cfg ? "idle" : "local";
    this.lastError = null;
    this._emit();
  };

  // Pull remote, union it with what this device has, and push the result back
  // so both sides end up holding the same history.
  Store.prototype.pull = function () {
    var self = this;
    if (!this.config) return Promise.resolve(this.progress);
    this.status = "syncing";
    this.lastError = null;
    this._emit();
    return ghPull(this.config)
      .then(function (remote) {
        self.sha = remote.sha;
        if (remote.progress) {
          var merged = merge(self.progress, remote.progress);
          var grew = merged.attempts.length !== remote.progress.attempts.length;
          self.progress = merged;
          localSave(merged);
          if (grew) return ghPush(self.config, merged, self.sha).then(function (r) {
            self.sha = r.sha;
          });
        } else {
          // First run against an empty repo path — seed it.
          return ghPush(self.config, self.progress, null).then(function (r) {
            self.sha = r.sha;
          });
        }
      })
      .then(function () {
        self.status = "synced";
        self._emit();
        return self.progress;
      })
      .catch(function (err) {
        self.status = "error";
        self.lastError = err.message || String(err);
        self._emit();
        return self.progress;
      });
  };

  Store.prototype.record = function (attempt) {
    this.progress.attempts.push(attempt);
    this.progress.updatedAt = new Date().toISOString();
    var storedLocally = localSave(this.progress);
    if (!storedLocally && !this.config) {
      this.status = "error";
      this.lastError = "This browser is refusing to store anything locally, so progress will vanish on reload. Export from Settings to keep it.";
    }
    this._emit();
    this._schedulePush();
  };

  Store.prototype._schedulePush = function () {
    var self = this;
    if (!this.config) return;
    if (this._timer) clearTimeout(this._timer);
    this.status = "pending";
    this._emit();
    this._timer = setTimeout(function () {
      self.push();
    }, PUSH_DEBOUNCE_MS);
  };

  Store.prototype.push = function () {
    var self = this;
    if (!this.config) return Promise.resolve();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.status = "syncing";
    this._emit();
    return ghPush(this.config, this.progress, this.sha)
      .then(function (r) {
        self.sha = r.sha;
        if (r.progress) {
          self.progress = r.progress;
          localSave(r.progress);
        }
        self.status = "synced";
        self.lastError = null;
        self._emit();
      })
      .catch(function (err) {
        self.status = "error";
        self.lastError = err.message || String(err);
        self._emit();
      });
  };

  Store.prototype.exportJSON = function () {
    return JSON.stringify(this.progress, null, 2);
  };

  Store.prototype.importJSON = function (text) {
    var incoming = JSON.parse(text);
    if (!incoming || !Array.isArray(incoming.attempts)) {
      throw new Error("That file does not look like a progress export.");
    }
    var before = this.progress.attempts.length;
    this.progress = merge(this.progress, incoming);
    localSave(this.progress);
    this._emit();
    this._schedulePush();
    return this.progress.attempts.length - before;
  };

  Store.prototype.reset = function () {
    this.progress = emptyProgress();
    localSave(this.progress);
    this._emit();
    this._schedulePush();
  };

  window.Store = Store;
  window.mergeProgress = merge;
})();
