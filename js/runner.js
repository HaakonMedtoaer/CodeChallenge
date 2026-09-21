// In-browser Python, so you can check your call against what actually happens.
//
// Pyodide is ~10MB and is loaded lazily — nothing is fetched until the first
// time you press Run, and nothing is fetched again after that.

(function () {
  "use strict";

  var VERSION = "0.29.5";
  var BASE = "https://cdn.jsdelivr.net/pyodide/v" + VERSION + "/full/";

  var loading = null;
  var pyodide = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("Could not load Pyodide from the CDN. Check your connection — everything else in the trainer works offline once loaded."));
      };
      document.head.appendChild(s);
    });
  }

  function ready(onProgress) {
    if (pyodide) return Promise.resolve(pyodide);
    if (loading) return loading;

    if (onProgress) onProgress("Fetching the Python runtime (about 10 MB, first time only)…");
    loading = loadScript(BASE + "pyodide.js")
      .then(function () {
        if (onProgress) onProgress("Starting Python…");
        return window.loadPyodide({ indexURL: BASE });
      })
      .then(function (py) {
        pyodide = py;
        return py;
      })
      .catch(function (err) {
        loading = null; // let the next press try again
        throw err;
      });
    return loading;
  }

  // Runs the snippet and returns { stdout, error, traceback }.
  //
  // A raised exception is a *result* here, not a failure — for most of these
  // exercises the traceback is the thing you came to see.
  function run(code, onProgress) {
    return ready(onProgress).then(function (py) {
      var out = [];
      py.setStdout({ batched: function (line) { out.push(line); } });
      py.setStderr({ batched: function (line) { out.push(line); } });

      // A fresh namespace each run, so one exercise cannot leak state into the
      // next — which would be an ironic bug for this particular tool to have.
      var globals = py.globals.get("dict")();
      return Promise.resolve()
        .then(function () {
          return py.runPythonAsync(code, { globals: globals });
        })
        .then(function () {
          return { stdout: out.join("\n"), error: null };
        })
        .catch(function (err) {
          var text = String(err && err.message ? err.message : err);
          // Pyodide wraps the Python traceback; keep the Python half.
          var marker = text.indexOf("Traceback (most recent call last)");
          return {
            stdout: out.join("\n"),
            error: marker >= 0 ? text.slice(marker) : text,
          };
        })
        .finally(function () {
          try { globals.destroy(); } catch (e) { /* already gone */ }
        });
    });
  }

  window.Runner = { run: run, isLoaded: function () { return !!pyodide; }, version: VERSION };
})();
