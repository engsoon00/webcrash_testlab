/* =========================================================================
 * WebView Error & Crash Test Lab — app.js
 * Vanilla JS. No dependencies. No automatic test execution.
 *
 * Every dangerous test requires an explicit button press.
 * Each test logs a "[TEST: <ID>] ..." marker so it can be correlated with
 * Flutter InAppWebView logs (onConsoleMessage / onRenderProcessGone / etc.)
 * and Firebase Crashlytics entries.
 * ========================================================================= */
(function () {
  "use strict";

  /* -----------------------------------------------------------------------
   * Original console references.
   * We tee console.* into the on-page log, so we must keep the *raw* methods
   * to avoid infinite recursion and double-logging.
   * --------------------------------------------------------------------- */
  var rawConsole = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: (console.debug ? console.debug.bind(console) : console.log.bind(console))
  };

  /* ----------------------------- Log store ----------------------------- */
  var MAX_ENTRIES = 2000;      // ring-buffer cap for the on-page log
  var logEntries = [];         // array of { time, level, message, testId }
  var logEl, logCountEl, autoscrollEl;

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function timestamp() {
    var d = new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function stringifyArgs(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a instanceof Error) {
        out.push(a.name + ": " + a.message);
      } else if (typeof a === "object" && a !== null) {
        try { out.push(JSON.stringify(a)); }
        catch (e) { out.push(String(a)); }
      } else {
        out.push(String(a));
      }
    }
    return out.join(" ");
  }

  /* Append one entry to the on-page event console (never calls console.*). */
  function uiLog(level, message, testId) {
    var entry = { time: timestamp(), level: level, message: message, testId: testId || null };
    logEntries.push(entry);
    if (logEntries.length > MAX_ENTRIES) logEntries.splice(0, logEntries.length - MAX_ENTRIES);

    if (!logEl) return;

    // Drop the "empty" placeholder on first real entry.
    var placeholder = logEl.querySelector(".log-empty");
    if (placeholder) placeholder.remove();

    var line = document.createElement("span");
    line.className = "log-line level-" + level;

    var ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = entry.time;

    var lvl = document.createElement("span");
    lvl.className = "lvl";
    lvl.textContent = "[" + level + "]";

    line.appendChild(ts);
    line.appendChild(lvl);

    if (entry.testId) {
      var t = document.createElement("span");
      t.className = "tidlog";
      t.textContent = "[TEST: " + entry.testId + "]";
      line.appendChild(t);
    }

    var msg = document.createElement("span");
    msg.textContent = message;
    line.appendChild(msg);

    // Trim DOM to the cap as well.
    while (logEl.childNodes.length >= MAX_ENTRIES) logEl.removeChild(logEl.firstChild);
    logEl.appendChild(line);

    if (logCountEl) logCountEl.textContent = String(logEntries.length);
    if (autoscrollEl && autoscrollEl.checked) logEl.scrollTop = logEl.scrollHeight;
  }

  /* Structured log: writes to the on-page console AND the real browser console
   * (via rawConsole, so Flutter's onConsoleMessage receives a clean line). */
  function logEvent(level, message, testId) {
    var prefix = testId ? "[TEST: " + testId + "] " : "";
    var full = prefix + message;
    switch (level) {
      case "ERROR":   rawConsole.error(full); break;
      case "WARN":    rawConsole.warn(full);  break;
      case "SUCCESS": rawConsole.log("SUCCESS " + full); break;
      case "DEBUG":   rawConsole.debug(full); break;
      case "INFO":
      default:        rawConsole.info(full);  break;
    }
    uiLog(level, message, testId);
  }

  /* Per-test status pill on the card. */
  function setStatus(testId, text, level) {
    var card = document.querySelector('[data-test-id="' + testId + '"]');
    if (!card) return;
    var s = card.querySelector("[data-status]");
    if (!s) return;
    s.textContent = text;
    if (level) s.setAttribute("data-level", level);
    else s.removeAttribute("data-level");
  }

  /* Defer a blocking task so the "started" log line can paint first. */
  function defer(fn) { setTimeout(fn, 60); }

  /* -----------------------------------------------------------------------
   * Console tee — mirror every console.* call into the on-page log.
   * Uses rawConsole for the real output, uiLog for the page.
   * --------------------------------------------------------------------- */
  function teeConsole(name, level) {
    var raw = rawConsole[name];
    console[name] = function () {
      raw.apply(console, arguments);           // real console -> Flutter onConsoleMessage
      try { uiLog(level, stringifyArgs(arguments), null); } catch (e) { /* never throw */ }
    };
  }

  /* -----------------------------------------------------------------------
   * Global error monitoring (as required by the spec).
   * These console.error calls are the important signal for Flutter's
   * onConsoleMessage handler.
   * --------------------------------------------------------------------- */
  window.addEventListener("error", function (event) {
    // Resource load errors (img/script) have no event.message.
    if (event && event.message) {
      console.error(
        "GLOBAL_JS_ERROR",
        event.message,
        event.filename,
        event.lineno,
        event.colno
      );
      uiLog("ERROR", "Uncaught " + event.message +
        "  (" + (event.filename || "?") + ":" + (event.lineno || 0) + ":" + (event.colno || 0) + ")", null);
    }
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event ? event.reason : undefined;
    var text = (reason instanceof Error) ? (reason.name + ": " + reason.message) : stringifyArgs([reason]);
    console.error("GLOBAL_UNHANDLED_REJECTION", reason);
    uiLog("ERROR", "Unhandled promise rejection: " + text, null);
  });

  /* =======================================================================
   * TEST IMPLEMENTATIONS
   * ===================================================================== */

  /* ---------- Category 1 — JavaScript Errors ---------- */

  function testUncaughtException() {
    var id = "JS-001";
    setStatus(id, "throwing…", "running");
    logEvent("INFO", "Test started: Uncaught JavaScript exception", id);
    console.error("TEST: About to throw uncaught JavaScript exception");
    throw new Error("TEST: Uncaught JavaScript exception"); // intentionally NOT caught
  }

  function testTypeError() {
    var id = "JS-002";
    setStatus(id, "throwing…", "running");
    logEvent("INFO", "Test started: TypeError", id);
    console.error("TEST: About to call a method on null (TypeError)");
    var obj = null;
    obj.someProperty(); // TypeError — intentionally uncaught
  }

  function testReferenceError() {
    var id = "JS-003";
    setStatus(id, "throwing…", "running");
    logEvent("INFO", "Test started: ReferenceError", id);
    console.error("TEST: About to read an undeclared variable (ReferenceError)");
    console.log(nonExistingVariable); // ReferenceError — intentionally uncaught
  }

  function testSyntaxError() {
    var id = "JS-004";
    setStatus(id, "throwing…", "running");
    logEvent("INFO", "Test started: Syntax Error via eval()", id);
    console.error("TEST: About to eval() invalid JavaScript (SyntaxError)");
    eval("function { invalid syntax"); // SyntaxError — intentionally uncaught
  }

  function testStackOverflow() {
    var id = "JS-005";
    setStatus(id, "recursing…", "running");
    logEvent("WARN", "Test started: Stack overflow (unbounded recursion). May freeze/crash the renderer.", id);
    console.error("TEST: About to trigger unbounded recursion (RangeError)");
    function recurse() { recurse(); }
    recurse(); // RangeError: Maximum call stack size exceeded — intentionally uncaught
  }

  /* ---------- Category 2 — Console Logging ---------- */

  function testConsoleError()  { setStatus("CONSOLE-001", "logged", "info"); logEvent("INFO", "Emitting console.error", "CONSOLE-001"); console.error("TEST console.error message"); }
  function testConsoleWarn()   { setStatus("CONSOLE-002", "logged", "info"); logEvent("INFO", "Emitting console.warn",  "CONSOLE-002"); console.warn("TEST console.warn message"); }
  function testConsoleInfo()   { setStatus("CONSOLE-003", "logged", "info"); logEvent("INFO", "Emitting console.info",  "CONSOLE-003"); console.info("TEST console.info message"); }
  function testConsoleDebug()  { setStatus("CONSOLE-004", "logged", "info"); logEvent("INFO", "Emitting console.debug", "CONSOLE-004"); console.debug("TEST console.debug message"); }

  function testMultipleConsoleErrors() {
    var id = "CONSOLE-005";
    setStatus(id, "emitting 100…", "running");
    logEvent("INFO", "Emitting ~100 console.error calls", id);
    for (var i = 0; i < 100; i++) {
      console.error("TEST console error #" + i);
    }
    logEvent("SUCCESS", "Emitted 100 console.error calls", id);
    setStatus(id, "done (100)", "success");
  }

  /* ---------- Category 3 — Promise / Async Errors ---------- */

  function testPromiseRejection() {
    var id = "PROMISE-001";
    setStatus(id, "rejecting…", "running");
    logEvent("INFO", "Creating an unhandled Promise rejection", id);
    Promise.reject(new Error("TEST: Unhandled Promise Rejection")); // no .catch()
    setStatus(id, "rejected", "info");
  }

  function testAsyncException() {
    var id = "PROMISE-002";
    setStatus(id, "throwing…", "running");
    logEvent("INFO", "Calling an async function that throws", id);
    async function test() { throw new Error("TEST: Async exception"); }
    test(); // returned rejected promise is not awaited/caught
    setStatus(id, "rejected", "info");
  }

  function testRepeatedAsyncErrors() {
    var id = "PROMISE-003";
    setStatus(id, "rejecting 20…", "running");
    logEvent("INFO", "Producing 20 unhandled rejected promises", id);
    for (var i = 0; i < 20; i++) {
      Promise.reject(new Error("TEST: Repeated async error #" + i)); // no .catch()
    }
    setStatus(id, "done (20)", "info");
  }

  /* ---------- Category 4 — Memory ---------- */

  // Global stores keep references alive so GC cannot reclaim them.
  window.__allocStore = window.__allocStore || [];
  window.memoryLeakStore = window.memoryLeakStore || [];
  var memoryLeakInterval = null;

  function testMemoryAllocation(mbArg) {
    var id = "MEM-001";
    var mb = parseInt(mbArg, 10) || 0;
    var bytes = mb * 1024 * 1024;
    setStatus(id, "allocating " + mb + " MB…", "running");
    logEvent("INFO", "Large memory allocation started: " + mb + " MB (WEBVIEW_MEMORY_TEST)", id);
    try {
      // Uint8Array gives a predictable byte count; filling forces real commit.
      var buf = new Uint8Array(bytes);
      buf.fill(1);
      window.__allocStore.push(buf);
      var total = 0;
      for (var i = 0; i < window.__allocStore.length; i++) total += window.__allocStore[i].byteLength || 0;
      logEvent("SUCCESS", "Allocated " + mb + " MB. Retained total ≈ " + (total / 1048576).toFixed(0) + " MB.", id);
      setStatus(id, "held ≈ " + (total / 1048576).toFixed(0) + " MB", "success");
    } catch (err) {
      logEvent("ERROR", "Allocation failed: " + (err && err.message ? err.message : err), id);
      setStatus(id, "alloc failed", "error");
    }
  }

  function freeAllocations() {
    var id = "MEM-001";
    var n = window.__allocStore.length;
    window.__allocStore = [];
    logEvent("INFO", "Freed " + n + " retained allocation(s)/canvas(es). GC may run shortly.", id);
    setStatus(id, "freed", "info");
    setStatus("MEM-004", "freed", "info");
  }

  function startMemoryLeak() {
    var id = "MEM-002";
    if (memoryLeakInterval) {
      logEvent("WARN", "Memory leak already running.", id);
      return;
    }
    logEvent("WARN", "Memory leak started — appending ~8 MB every 500 ms.", id);
    setStatus(id, "leaking…", "running");
    memoryLeakInterval = setInterval(function () {
      try {
        window.memoryLeakStore.push(new Array(1000000).fill("MEMORY_LEAK_TEST"));
        console.warn("TEST: Memory leak allocation performed (chunks=" + window.memoryLeakStore.length + ")");
        setStatus(id, "leaking… " + window.memoryLeakStore.length + " chunks", "running");
      } catch (err) {
        console.error("TEST: Memory leak allocation failed: " + (err && err.message ? err.message : err));
        stopMemoryLeak();
        setStatus(id, "alloc failed", "error");
      }
    }, 500);
  }

  function stopMemoryLeak() {
    var id = "MEM-002";
    if (memoryLeakInterval) {
      clearInterval(memoryLeakInterval);
      memoryLeakInterval = null;
      logEvent("INFO", "Memory leak stopped. Retained chunks: " + window.memoryLeakStore.length, id);
      setStatus(id, "stopped (" + window.memoryLeakStore.length + " chunks)", "info");
    } else {
      logEvent("INFO", "Memory leak was not running.", id);
    }
  }

  function clearMemory() {
    var id = "MEM-002";
    var n = window.memoryLeakStore.length;
    window.memoryLeakStore = [];
    logEvent("INFO", "Cleared memory leak store (" + n + " chunks released).", id);
    setStatus(id, "cleared", "info");
  }

  function testLargeDOM() {
    var id = "MEM-003";
    var COUNT = 100000;
    setStatus(id, "building…", "running");
    logEvent("INFO", "Creating " + COUNT + " DOM nodes.", id);
    defer(function () {
      try {
        var container = document.createElement("div");
        container.style.display = "none"; // avoid layout thrash while inserting
        container.setAttribute("data-domtest", "1");
        var frag = document.createDocumentFragment();
        for (var i = 0; i < COUNT; i++) {
          var el = document.createElement("div");
          el.textContent = "DOM TEST NODE " + i;
          frag.appendChild(el);
          if (i % 25000 === 0 && i > 0) console.warn("TEST: Large DOM progress " + i + "/" + COUNT);
        }
        container.appendChild(frag);
        document.body.appendChild(container);
        logEvent("SUCCESS", "Inserted " + COUNT + " DOM nodes.", id);
        setStatus(id, "added " + COUNT, "success");
      } catch (err) {
        logEvent("ERROR", "Large DOM failed: " + (err && err.message ? err.message : err), id);
        setStatus(id, "failed", "error");
      }
    });
  }

  function testLargeCanvas(sizeArg) {
    var id = "MEM-004";
    var size = parseInt(sizeArg, 10) || 4000;
    var estMB = (size * size * 4 / 1048576).toFixed(0);
    setStatus(id, size + "² (~" + estMB + " MB)…", "running");
    logEvent("INFO", "Creating canvas " + size + "×" + size + " (~" + estMB + " MB backing store).", id);
    defer(function () {
      try {
        var canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D context unavailable");
        // Draw a few times to force the backing store to be committed.
        for (var p = 0; p < 3; p++) {
          ctx.fillStyle = p % 2 ? "#ff0000" : "#00ff00";
          ctx.fillRect(0, 0, size, size);
        }
        window.__allocStore.push(canvas);
        logEvent("SUCCESS", "Canvas " + size + "² created & retained (~" + estMB + " MB).", id);
        setStatus(id, "held " + size + "²", "success");
      } catch (err) {
        logEvent("ERROR", "Canvas allocation failed: " + (err && err.message ? err.message : err), id);
        setStatus(id, "failed", "error");
      }
    });
  }

  /* ---------- Category 5 — CPU / Renderer ---------- */

  function testInfiniteLoop() {
    var id = "CPU-001";
    logEvent("WARN", "Infinite loop starting — the WebView will become unresponsive.", id);
    console.error("TEST: Entering infinite loop (CPU-001). WebView will freeze.");
    setStatus(id, "FROZEN", "error");
    defer(function () {
      // eslint-disable-next-line no-constant-condition
      while (true) { Math.sqrt(Math.random()); } // never returns
    });
  }

  function testCPUStress() {
    var id = "CPU-002";
    logEvent("WARN", "Heavy CPU loop for ~10 s (blocking, then recovers).", id);
    setStatus(id, "burning ~10 s…", "running");
    defer(function () {
      var start = Date.now();
      var acc = 0;
      while (Date.now() - start < 10000) {
        for (var i = 0; i < 100000; i++) acc += Math.sqrt(i * Math.random());
      }
      logEvent("SUCCESS", "CPU stress finished (~10 s). acc=" + acc.toFixed(0), id);
      setStatus(id, "done", "success");
    });
  }

  var animRafId = null;
  var animElements = [];

  function startAnimationStress() {
    var id = "CPU-003";
    if (animRafId) { logEvent("WARN", "Animation stress already running.", id); return; }
    var COUNT = 2000;
    logEvent("INFO", "Starting animation stress: " + COUNT + " animated elements.", id);
    setStatus(id, "animating…", "running");

    var layer = document.createElement("div");
    layer.setAttribute("data-animlayer", "1");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999;";
    for (var i = 0; i < COUNT; i++) {
      var dot = document.createElement("div");
      dot.style.cssText =
        "position:absolute;width:8px;height:8px;border-radius:50%;background:hsl(" +
        (i % 360) + ",80%,55%);left:0;top:0;will-change:transform;";
      dot._a = Math.random() * Math.PI * 2;
      dot._r = 20 + Math.random() * 160;
      dot._s = 0.5 + Math.random() * 2;
      layer.appendChild(dot);
      animElements.push(dot);
    }
    document.body.appendChild(layer);

    var t = 0;
    function frame() {
      t += 0.03;
      var w = window.innerWidth, h = window.innerHeight;
      for (var j = 0; j < animElements.length; j++) {
        var d = animElements[j];
        var x = w / 2 + Math.cos(d._a + t * d._s) * d._r + (j % 50) * 3;
        var y = h / 2 + Math.sin(d._a + t * d._s) * d._r + ((j / 50) | 0) * 3;
        d.style.transform = "translate(" + x + "px," + y + "px)";
      }
      animRafId = requestAnimationFrame(frame);
    }
    animRafId = requestAnimationFrame(frame);
  }

  function stopAnimationStress() {
    var id = "CPU-003";
    if (animRafId) { cancelAnimationFrame(animRafId); animRafId = null; }
    var layer = document.querySelector('[data-animlayer="1"]');
    if (layer) layer.remove();
    animElements = [];
    logEvent("INFO", "Animation stress stopped.", id);
    setStatus(id, "stopped", "info");
  }

  /* ---------- Category 6 — Network ---------- */

  function apiBase() {
    var input = document.getElementById("apiBase");
    var v = (input && input.value ? input.value : "https://httpstat.us").trim();
    return v.replace(/\/+$/, "");
  }

  function testInvalidDomain() {
    var id = "NETWORK-001";
    var url = "https://this-domain-does-not-exist-123456789.example/";
    setStatus(id, "fetching…", "running");
    logEvent("INFO", "Fetching non-resolving domain: " + url, id);
    console.error("TEST: fetch() to invalid domain (rejection intentionally not caught): " + url);
    fetch(url); // rejection surfaces via global unhandledrejection handler
    setStatus(id, "dispatched", "info");
  }

  function testHttp404() {
    var id = "NETWORK-002";
    var url = apiBase() + "/404";
    setStatus(id, "fetching…", "running");
    logEvent("INFO", "Requesting HTTP 404: " + url, id);
    fetch(url).then(function (res) {
      console.error("TEST: HTTP " + res.status + " received from " + url);
      logEvent(res.ok ? "WARN" : "ERROR", "Response status " + res.status + " " + res.statusText, id);
      setStatus(id, "HTTP " + res.status, res.ok ? "info" : "error");
    }).catch(function (err) {
      logEvent("ERROR", "Request failed (network/CORS): " + (err && err.message ? err.message : err), id);
      setStatus(id, "failed", "error");
    });
  }

  function testHttp500() {
    var id = "NETWORK-003";
    var url = apiBase() + "/500";
    setStatus(id, "fetching…", "running");
    logEvent("INFO", "Requesting HTTP 500: " + url, id);
    fetch(url).then(function (res) {
      console.error("TEST: HTTP " + res.status + " received from " + url);
      logEvent("ERROR", "Response status " + res.status + " " + res.statusText, id);
      setStatus(id, "HTTP " + res.status, "error");
    }).catch(function (err) {
      logEvent("ERROR", "Request failed (network/CORS): " + (err && err.message ? err.message : err), id);
      setStatus(id, "failed", "error");
    });
  }

  function testNetworkTimeout() {
    var id = "NETWORK-004";
    var TIMEOUT = 10000;
    var url = apiBase() + "/200?sleep=30000"; // slow endpoint (~30 s)
    setStatus(id, "waiting…", "running");
    logEvent("INFO", "Requesting slow endpoint, aborting after " + (TIMEOUT / 1000) + " s: " + url, id);

    var controller = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT);

    fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        clearTimeout(timer);
        logEvent("WARN", "Slow endpoint responded before timeout: HTTP " + res.status, id);
        setStatus(id, "HTTP " + res.status, "info");
      })
      .catch(function (err) {
        clearTimeout(timer);
        var aborted = err && err.name === "AbortError";
        console.error("TEST: Network timeout/abort: " + (err && err.message ? err.message : err));
        logEvent("ERROR", (aborted ? "Aborted after timeout: " : "Request failed: ") + (err && err.message ? err.message : err), id);
        setStatus(id, aborted ? "timed out" : "failed", "error");
      });
  }

  /* ---------- Category 7 — Security ---------- */

  function testMixedContent() {
    var id = "SEC-001";
    var url = "http://example.com/";
    setStatus(id, "fetching http…", "running");
    logEvent("INFO", "Attempting HTTP fetch from this page (mixed content): " + url, id);
    fetch(url).then(function (res) {
      logEvent("WARN", "Mixed-content request completed: HTTP " + res.status + " (not blocked here).", id);
      setStatus(id, "HTTP " + res.status, "info");
    }).catch(function (err) {
      console.error("TEST: Mixed content blocked/failed: " + (err && err.message ? err.message : err));
      logEvent("ERROR", "Mixed-content request blocked/failed: " + (err && err.message ? err.message : err), id);
      setStatus(id, "blocked", "error");
    });
  }

  function testCorsError() {
    var id = "SEC-002";
    // A cross-origin endpoint that does NOT send Access-Control-Allow-Origin for us.
    var url = "https://www.google.com/";
    setStatus(id, "fetching…", "running");
    logEvent("INFO", "Fetching cross-origin resource without CORS permission: " + url, id);
    fetch(url).then(function (res) {
      logEvent("WARN", "Request returned (opaque or permitted): status " + res.status, id);
      setStatus(id, "status " + res.status, "info");
    }).catch(function (err) {
      console.error("TEST: CORS/network error: " + (err && err.message ? err.message : err));
      logEvent("ERROR", "CORS/network error: " + (err && err.message ? err.message : err), id);
      setStatus(id, "CORS blocked", "error");
    });
  }

  /* ---------- Category 8 — Web API / Permissions ---------- */

  function testGeolocation() {
    var id = "PERMISSION-001";
    setStatus(id, "requesting…", "running");
    logEvent("INFO", "Requesting geolocation.", id);
    if (!("geolocation" in navigator)) {
      console.error("TEST: Geolocation API unavailable");
      logEvent("ERROR", "Geolocation API unavailable.", id);
      setStatus(id, "unsupported", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        logEvent("SUCCESS", "Geolocation granted: " +
          pos.coords.latitude.toFixed(4) + ", " + pos.coords.longitude.toFixed(4), id);
        setStatus(id, "granted", "success");
      },
      function (err) {
        console.error("TEST: Geolocation error (" + err.code + "): " + err.message);
        logEvent("ERROR", "Geolocation error (" + err.code + "): " + err.message, id);
        setStatus(id, "denied/err", "error");
      },
      { timeout: 15000, enableHighAccuracy: false }
    );
  }

  function testNotification() {
    var id = "PERMISSION-002";
    setStatus(id, "requesting…", "running");
    logEvent("INFO", "Requesting notification permission.", id);
    if (!("Notification" in window)) {
      console.error("TEST: Notification API unavailable");
      logEvent("ERROR", "Notification API unavailable.", id);
      setStatus(id, "unsupported", "error");
      return;
    }
    try {
      var p = Notification.requestPermission(function (result) { report(result); });
      if (p && typeof p.then === "function") p.then(report).catch(function (e) {
        logEvent("ERROR", "Notification request failed: " + e, id);
        setStatus(id, "error", "error");
      });
    } catch (err) {
      logEvent("ERROR", "Notification request threw: " + (err && err.message ? err.message : err), id);
      setStatus(id, "error", "error");
    }
    function report(result) {
      logEvent(result === "granted" ? "SUCCESS" : "WARN", "Notification permission: " + result, id);
      setStatus(id, result, result === "granted" ? "success" : "info");
    }
  }

  function testCamera()      { requestMedia("PERMISSION-003", { video: true }, "camera"); }
  function testMicrophone()  { requestMedia("PERMISSION-004", { audio: true }, "microphone"); }

  function requestMedia(id, constraints, label) {
    setStatus(id, "requesting…", "running");
    logEvent("INFO", "Requesting " + label + " access.", id);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("TEST: getUserMedia unavailable for " + label);
      logEvent("ERROR", "getUserMedia unavailable (" + label + ").", id);
      setStatus(id, "unsupported", "error");
      return;
    }
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      logEvent("SUCCESS", label + " granted; stopping tracks immediately.", id);
      stream.getTracks().forEach(function (t) { t.stop(); }); // release the device
      setStatus(id, "granted", "success");
    }).catch(function (err) {
      console.error("TEST: " + label + " denied/failed: " + err.name + " " + err.message);
      logEvent("ERROR", label + " denied/failed: " + err.name + " — " + err.message, id);
      setStatus(id, "denied/err", "error");
    });
  }

  /* ---------- Category 9 — Storage ---------- */

  function testStorageQuota() {
    var id = "STORAGE-001";
    setStatus(id, "writing…", "running");
    logEvent("INFO", "Writing large strings to localStorage until quota is exceeded.", id);
    var chunk = new Array(1024 * 1024 + 1).join("A"); // ~1 MB string
    var written = 0;
    var keys = [];
    try {
      for (var i = 0; i < 5000; i++) {
        var key = "__quota_test_" + i;
        localStorage.setItem(key, chunk);
        keys.push(key);
        written++;
      }
      // Reached the loop cap without an error (large or unlimited quota).
      logEvent("WARN", "Wrote " + written + " × ~1 MB without hitting quota (cap reached).", id);
      setStatus(id, "no quota hit", "info");
    } catch (err) {
      console.error("TEST: localStorage quota exceeded");
      logEvent("ERROR", "localStorage quota exceeded after ~" + written + " MB: " + (err && err.name ? err.name : err), id);
      setStatus(id, "quota exceeded", "error");
    } finally {
      // Clean up so the app isn't left broken on reload.
      for (var k = 0; k < keys.length; k++) {
        try { localStorage.removeItem(keys[k]); } catch (e) { /* ignore */ }
      }
      logEvent("INFO", "Cleared " + keys.length + " test key(s) from localStorage.", id);
    }
  }

  function testIndexedDB() {
    var id = "STORAGE-002";
    setStatus(id, "opening…", "running");
    logEvent("INFO", "Opening IndexedDB and writing progressively larger blobs.", id);
    if (!("indexedDB" in window)) {
      console.error("TEST: IndexedDB unavailable");
      logEvent("ERROR", "IndexedDB unavailable.", id);
      setStatus(id, "unsupported", "error");
      return;
    }
    var DB = "webview_error_test_db";
    var req = indexedDB.open(DB, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore("blobs", { keyPath: "id" });
    };
    req.onerror = function () {
      logEvent("ERROR", "IndexedDB open error: " + (req.error && req.error.message), id);
      setStatus(id, "open failed", "error");
    };
    req.onsuccess = function () {
      var db = req.result;
      var sizesMB = [1, 5, 10, 25, 50];
      var idx = 0;
      function next() {
        if (idx >= sizesMB.length) {
          logEvent("SUCCESS", "IndexedDB writes complete. Deleting test DB.", id);
          setStatus(id, "done", "success");
          db.close();
          indexedDB.deleteDatabase(DB);
          return;
        }
        var mb = sizesMB[idx++];
        var payload;
        try {
          payload = new Uint8Array(mb * 1024 * 1024);
        } catch (e) {
          console.error("TEST: Failed to allocate " + mb + " MB payload: " + e);
          logEvent("ERROR", "Payload allocation failed at " + mb + " MB: " + e, id);
          setStatus(id, "alloc failed", "error");
          db.close();
          return;
        }
        var tx = db.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put({ id: "blob_" + mb, data: payload });
        tx.oncomplete = function () {
          logEvent("SUCCESS", "Wrote " + mb + " MB blob to IndexedDB.", id);
          setStatus(id, "wrote " + mb + " MB", "success");
          next();
        };
        tx.onerror = function () {
          console.error("TEST: IndexedDB write error at " + mb + " MB: " + (tx.error && tx.error.name));
          logEvent("ERROR", "IndexedDB write error at " + mb + " MB: " + (tx.error && tx.error.name), id);
          setStatus(id, "write err @" + mb + "MB", "error");
          db.close();
        };
      }
      next();
    };
  }

  /* ---------- Category 10 — WebGL ---------- */

  function testWebGL() {
    var id = "WEBGL-001";
    setStatus(id, "creating…", "running");
    logEvent("INFO", "Creating WebGL context and stressing GPU resources.", id);
    var canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 1024;
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      console.error("TEST: WebGL context lost (GPU pressure / process issue).");
      logEvent("ERROR", "WebGL context lost.", id);
      setStatus(id, "context lost", "error");
    });

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
      console.error("TEST: WebGL unavailable");
      logEvent("ERROR", "WebGL unavailable.", id);
      setStatus(id, "unavailable", "error");
      return;
    }
    window.__webglStore = window.__webglStore || { gl: gl, textures: [], buffers: [] };
    try {
      var TEX = 200, TEXSIZE = 1024;
      var pixels = new Uint8Array(TEXSIZE * TEXSIZE * 4);
      for (var i = 0; i < TEX; i++) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TEXSIZE, TEXSIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        window.__webglStore.textures.push(tex);

        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(65536), gl.STATIC_DRAW);
        window.__webglStore.buffers.push(buf);

        var glErr = gl.getError();
        if (glErr !== gl.NO_ERROR) {
          console.error("TEST: WebGL error code " + glErr + " after " + i + " textures");
          logEvent("ERROR", "WebGL error code " + glErr + " after " + i + " textures.", id);
          setStatus(id, "gl error", "error");
          return;
        }
      }
      gl.finish();
      logEvent("SUCCESS", "Allocated " + TEX + " × " + TEXSIZE + "² textures + buffers (~" +
        (TEX * TEXSIZE * TEXSIZE * 4 / 1048576).toFixed(0) + " MB GPU).", id);
      setStatus(id, "held " + TEX + " tex", "success");
    } catch (err) {
      console.error("TEST: WebGL stress failed: " + (err && err.message ? err.message : err));
      logEvent("ERROR", "WebGL stress failed: " + (err && err.message ? err.message : err), id);
      setStatus(id, "failed", "error");
    }
  }

  /* ---------- Category 11 — Lifecycle ---------- */

  function testReload() {
    var id = "LIFECYCLE-001";
    logEvent("INFO", "Reloading the WebView now (location.reload()).", id);
    console.warn("TEST: location.reload() invoked");
    defer(function () { location.reload(); });
  }

  function testNavigateInvalid() {
    var id = "LIFECYCLE-002";
    var url = "https://this-domain-does-not-exist-123456789.invalid/";
    logEvent("WARN", "Navigating to a non-resolving URL (main-frame load error): " + url, id);
    console.error("TEST: Navigating away to invalid URL: " + url);
    defer(function () { location.href = url; });
  }

  function testDestroyDOM() {
    var id = "LIFECYCLE-003";
    logEvent("WARN", "Destroying most page DOM (keeping header + event log).", id);
    console.error("TEST: Removing main DOM content");
    defer(function () {
      var keepLog = document.getElementById("log-card");
      var main = document.getElementById("app");
      if (main) {
        var kids = Array.prototype.slice.call(main.children);
        kids.forEach(function (child) {
          if (child !== keepLog) child.remove();
        });
      }
      // Remove any stray test layers/containers appended to body.
      document.querySelectorAll('[data-domtest],[data-animlayer]').forEach(function (n) { n.remove(); });
      logEvent("SUCCESS", "Main DOM removed. Event log retained.", id);
    });
  }

  function testFreezeUI() {
    var id = "LIFECYCLE-004";
    logEvent("WARN", "Freezing UI (blocking main thread) for ~5 s.", id);
    setStatus(id, "frozen ~5 s…", "running");
    defer(function () {
      var start = Date.now();
      while (Date.now() - start < 5000) { Math.random(); }
      logEvent("SUCCESS", "UI unfrozen after ~5 s.", id);
      setStatus(id, "recovered", "success");
    });
  }

  /* ---------- Category 12 — Renderer Crash / Process Gone ---------- */

  function testRendererStress() {
    var id = "RENDERER-001";
    logEvent("WARN", "Renderer stress starting: memory + DOM + canvas + WebGL + CPU. " +
      "Renderer crash is platform-dependent and NOT guaranteed.", id);
    console.error("TEST: Combined renderer stress starting (RENDERER-001)");
    setStatus(id, "stressing…", "running");

    var steps = [
      function () { logEvent("INFO", "Step 1/5: allocate 500 MB.", id); testMemoryAllocation(500); },
      function () { logEvent("INFO", "Step 2/5: build large DOM.", id); testLargeDOM(); },
      function () { logEvent("INFO", "Step 3/5: create 6000² canvas.", id); testLargeCanvas(6000); },
      function () { logEvent("INFO", "Step 4/5: WebGL stress.", id); testWebGL(); },
      function () { logEvent("INFO", "Step 5/5: allocate another 500 MB.", id); testMemoryAllocation(500); }
    ];
    var i = 0;
    (function runStep() {
      if (i >= steps.length) {
        logEvent("WARN", "Renderer stress sequence dispatched. Watch Flutter onRenderProcessGone " +
          "(fires only if the renderer process actually terminates).", id);
        setStatus(id, "dispatched", "info");
        // Short CPU burst at the end.
        var start = Date.now();
        while (Date.now() - start < 1500) { Math.sqrt(Math.random()); }
        return;
      }
      try { steps[i++](); } catch (e) {
        logEvent("ERROR", "Renderer stress step failed: " + (e && e.message ? e.message : e), id);
      }
      setTimeout(runStep, 400);
    })();
  }

  /* =======================================================================
   * Log controls
   * ===================================================================== */

  function clearLogs() {
    logEntries = [];
    if (logEl) {
      logEl.innerHTML = '<span class="log-empty">Log cleared. Trigger a test to produce entries…</span>';
    }
    if (logCountEl) logCountEl.textContent = "0";
    rawConsole.info("[EventLog] cleared");
  }

  function copyLogs() {
    var text = logEntries.map(function (e) {
      return e.time + " [" + e.level + "] " + (e.testId ? "[TEST: " + e.testId + "] " : "") + e.message;
    }).join("\n");

    function done(ok) {
      logEvent(ok ? "SUCCESS" : "ERROR",
        ok ? ("Copied " + logEntries.length + " log line(s) to clipboard.")
           : "Clipboard copy failed — select the log text manually.", null);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand("copy");
      ta.remove();
      done(!!ok);
    } catch (e) {
      done(false);
    }
  }

  function applyApiBase() {
    logEvent("INFO", "API base set to: " + apiBase(), null);
  }

  /* =======================================================================
   * Action registry + wiring
   * ===================================================================== */
  var ACTIONS = {
    // Category 1
    testUncaughtException: testUncaughtException,
    testTypeError: testTypeError,
    testReferenceError: testReferenceError,
    testSyntaxError: testSyntaxError,
    testStackOverflow: testStackOverflow,
    // Category 2
    testConsoleError: testConsoleError,
    testConsoleWarn: testConsoleWarn,
    testConsoleInfo: testConsoleInfo,
    testConsoleDebug: testConsoleDebug,
    testMultipleConsoleErrors: testMultipleConsoleErrors,
    // Category 3
    testPromiseRejection: testPromiseRejection,
    testAsyncException: testAsyncException,
    testRepeatedAsyncErrors: testRepeatedAsyncErrors,
    // Category 4
    testMemoryAllocation: testMemoryAllocation,
    freeAllocations: freeAllocations,
    startMemoryLeak: startMemoryLeak,
    stopMemoryLeak: stopMemoryLeak,
    clearMemory: clearMemory,
    testLargeDOM: testLargeDOM,
    testLargeCanvas: testLargeCanvas,
    // Category 5
    testInfiniteLoop: testInfiniteLoop,
    testCPUStress: testCPUStress,
    startAnimationStress: startAnimationStress,
    stopAnimationStress: stopAnimationStress,
    // Category 6
    testInvalidDomain: testInvalidDomain,
    testHttp404: testHttp404,
    testHttp500: testHttp500,
    testNetworkTimeout: testNetworkTimeout,
    // Category 7
    testMixedContent: testMixedContent,
    testCorsError: testCorsError,
    // Category 8
    testGeolocation: testGeolocation,
    testNotification: testNotification,
    testCamera: testCamera,
    testMicrophone: testMicrophone,
    // Category 9
    testStorageQuota: testStorageQuota,
    testIndexedDB: testIndexedDB,
    // Category 10
    testWebGL: testWebGL,
    // Category 11
    testReload: testReload,
    testNavigateInvalid: testNavigateInvalid,
    testDestroyDOM: testDestroyDOM,
    testFreezeUI: testFreezeUI,
    // Category 12
    testRendererStress: testRendererStress,
    // Log controls
    clearLogs: clearLogs,
    copyLogs: copyLogs,
    applyApiBase: applyApiBase
  };

  // Expose the test functions globally so they can also be invoked from the
  // Flutter side via evaluateJavascript() / callAsyncJavaScript() if desired.
  Object.keys(ACTIONS).forEach(function (name) { window[name] = ACTIONS[name]; });

  function onReady() {
    logEl = document.getElementById("log");
    logCountEl = document.getElementById("logCount");
    autoscrollEl = document.getElementById("autoscroll");

    if (logEl && !logEl.childNodes.length) {
      logEl.innerHTML = '<span class="log-empty">Ready. Trigger a test to produce entries…</span>';
    }

    // Tee console.* AFTER the log element exists so early logs aren't lost visually.
    teeConsole("log", "LOG");
    teeConsole("info", "INFO");
    teeConsole("warn", "WARN");
    teeConsole("error", "ERROR");
    teeConsole("debug", "DEBUG");

    // Delegated click handler. IMPORTANT: not wrapped in try/catch, so tests
    // that intentionally throw become genuine uncaught errors.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-action]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var arg = btn.getAttribute("data-arg");
      var fn = ACTIONS[action];
      if (typeof fn !== "function") {
        logEvent("ERROR", "Unknown action: " + action, null);
        return;
      }
      fn(arg, btn); // may throw on purpose -> uncaught -> window 'error'
    });

    logEvent("INFO", "WebView Error & Crash Test Lab ready. " + Object.keys(ACTIONS).length +
      " actions wired. No tests run automatically.", null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
