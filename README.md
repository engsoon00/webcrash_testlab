# WebView Error & Crash Test Lab — Development Only

A small, standalone, **static** web app that intentionally reproduces real-world
web/WebView failures so you can verify exactly what a Flutter
[`flutter_inappwebview`](https://pub.dev/packages/flutter_inappwebview) WebView can
observe and forward to Firebase Crashlytics (or any custom logging).

Every dangerous test is **manual** — nothing runs on load. Each test emits a
`[TEST: <ID>]` marker so a website event can be correlated with a Flutter log line
and a Crashlytics entry.

> ⚠️ **This is a test tool only.** Some tests will freeze or may crash the WebView.

---

## Files

```
/
├── index.html   # UI: categorized test buttons + live event log + Flutter docs
├── style.css    # Dark developer-tool theme, mobile-first
├── app.js       # All test functions, logging, global error monitoring
└── README.md    # This file
```

No frameworks, no build step, no backend, **no external JS dependencies**.

---

## 1. How to run locally

Because it is fully static, any static file server works. Pick one:

```bash
# Python 3
python3 -m http.server 8000
```

```bash
# Node (no install)
npx serve .
```

Then open <http://localhost:8000> (or the port your server prints).

Opening `index.html` directly via `file://` also works for most tests, but a few
behave differently off `http(s)://`:

- **Mixed content (SEC-001)** only means anything on an **HTTPS** origin.
- **HTTP 404 / 500 / timeout (NETWORK-002/003/004)** need network access and a
  reachable endpoint (see *Configurable endpoint* below).
- **Geolocation / camera / mic / notifications** may require a secure origin
  (`https://` or `localhost`).

Serve over HTTPS to exercise it the way a Flutter WebView loads a real site.

### Loading it inside Flutter InAppWebView

```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri("https://YOUR_HOST/index.html")),
  // ...register the callbacks listed below...
)
```

You can also drive individual tests from the Flutter side — every test function is
exposed on `window` (e.g. `testUncaughtException()`, `testMemoryAllocation(500)`),
so `controller.evaluateJavascript(source: "testHttp404()")` works.

---

## 2. How to deploy as a static website

Upload the four files to any static host. Examples:

- **Firebase Hosting:** `firebase init hosting` (public dir = this folder), then `firebase deploy`.
- **GitHub Pages:** push to a repo and enable Pages on the branch/folder.
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the folder or point at the repo; no build command.
- **Nginx/Apache/S3:** copy the files into the web root / bucket.

Serve over **HTTPS** so the mixed-content and permission tests behave as they will
in production.

### Configurable endpoint (HTTP 404 / 500 / timeout)

The page has an **API base endpoint** field (top of the page). Default:
`https://httpstat.us`.

- `{base}/404` → returns HTTP 404
- `{base}/500` → returns HTTP 500
- `{base}/200?sleep=30000` → responds slowly (used by the timeout test, which aborts after 10 s)

`httpstat.us` sends permissive CORS headers, so the JS `fetch()` can read the
status. Point this field at your own backend to test real endpoints. In `app.js`
the value is read by `apiBase()`.

> Note: A `fetch()` HTTP error status (404/500) does **not** always surface through
> Flutter's `onReceivedHttpError`/`onLoadHttpError` — those primarily fire for
> **frame/resource loads** the WebView performs, not necessarily XHR/fetch. The
> status is still visible in `console.error` (→ `onConsoleMessage`). To test the
> HTTP-error load callbacks directly, navigate the WebView to a URL that returns
> 404/500 (e.g. set `initialUrlRequest` to `{base}/404`).

---

## 3. What each test does

### Category 1 — JavaScript Errors
| ID | Button | What happens |
|----|--------|--------------|
| JS-001 | Trigger JS Exception | `throw new Error(...)`, uncaught → `window.onerror` |
| JS-002 | Trigger TypeError | Calls a method on `null` |
| JS-003 | Trigger ReferenceError | Reads an undeclared variable |
| JS-004 | Trigger Syntax Error | `eval("function { invalid syntax")` |
| JS-005 | Trigger Stack Overflow | Unbounded recursion → `RangeError` (⚠️ may freeze/crash renderer) |

### Category 2 — Console Logging
| ID | Button | What happens |
|----|--------|--------------|
| CONSOLE-001 | Console Error | one `console.error` |
| CONSOLE-002 | Console Warning | one `console.warn` |
| CONSOLE-003 | Console Info | one `console.info` |
| CONSOLE-004 | Console Debug | one `console.debug` |
| CONSOLE-005 | Multiple Console Errors | ~100 `console.error` rapidly (stresses `onConsoleMessage`) |

### Category 3 — Promise / Async Errors
| ID | Button | What happens |
|----|--------|--------------|
| PROMISE-001 | Unhandled Promise Rejection | `Promise.reject(...)`, no `.catch()` |
| PROMISE-002 | Async Exception | `async` fn throws; promise rejects unhandled |
| PROMISE-003 | Repeated Async Errors | 20 unhandled rejections |

### Category 4 — Memory Stress
| ID | Button(s) | What happens |
|----|-----------|--------------|
| MEM-001 | Allocate 100/250/500 MB, 1 GB · Free Allocations | Allocates & fills a `Uint8Array`, kept alive until freed |
| MEM-002 | Start / Stop / Clear Memory Leak | Appends ~8 MB to a global array every 500 ms |
| MEM-003 | Create Huge DOM | Inserts 100,000 DOM nodes |
| MEM-004 | Canvas 4000²/6000²/8000² · Free Allocations | Large canvas backing stores, kept alive |

### Category 5 — CPU / Renderer (⚠️ HIGH RISK)
| ID | Button(s) | What happens |
|----|-----------|--------------|
| CPU-001 | Infinite Loop | `while(true)` — **permanently freezes** the WebView |
| CPU-002 | 10 Seconds | Heavy blocking math for ~10 s, then recovers |
| CPU-003 | Start / Stop Animation Stress | Thousands of continuously animated elements |

### Category 6 — Network
| ID | Button | What happens |
|----|--------|--------------|
| NETWORK-001 | Invalid Domain | `fetch()` to a non-resolving host; rejection not caught |
| NETWORK-002 | HTTP 404 | `fetch({base}/404)`, logs status |
| NETWORK-003 | HTTP 500 | `fetch({base}/500)`, logs status |
| NETWORK-004 | Network Timeout | slow endpoint, aborts after 10 s |

### Category 7 — Security / Restrictions
| ID | Button | What happens |
|----|--------|--------------|
| SEC-001 | Mixed Content | HTTPS page fetches an `http://` resource |
| SEC-002 | CORS Error | Cross-origin fetch without CORS permission |

### Category 8 — Web API / Permissions
| ID | Button | What happens |
|----|--------|--------------|
| PERMISSION-001 | Request Geolocation | `getCurrentPosition()` |
| PERMISSION-002 | Request Notification | `Notification.requestPermission()` |
| PERMISSION-003 | Request Camera | `getUserMedia({video:true})` (tracks stopped immediately) |
| PERMISSION-004 | Request Microphone | `getUserMedia({audio:true})` (tracks stopped immediately) |

### Category 9 — Storage
| ID | Button | What happens |
|----|--------|--------------|
| STORAGE-001 | Storage Stress | Writes ~1 MB strings to `localStorage` until quota; cleans up |
| STORAGE-002 | IndexedDB Test | Writes 1→50 MB blobs; deletes the DB after |

### Category 10 — WebGL
| ID | Button | What happens |
|----|--------|--------------|
| WEBGL-001 | WebGL Test | Creates a context; allocates many textures/buffers; listens for `webglcontextlost` |

### Category 11 — Lifecycle
| ID | Button | What happens |
|----|--------|--------------|
| LIFECYCLE-001 | Reload WebView | `location.reload()` |
| LIFECYCLE-002 | Navigate To Invalid Page | Navigates to a non-resolving URL (leaves the page) |
| LIFECYCLE-003 | Destroy DOM | Removes most elements (keeps header + log) |
| LIFECYCLE-004 | Freeze UI — 5 Seconds | Blocks the main thread ~5 s |

### Category 12 — Renderer Crash / Process Gone
| ID | Button | What happens |
|----|--------|--------------|
| RENDERER-001 | Renderer Stress Test | Combines memory + DOM + canvas + WebGL + CPU pressure |

---

## 4. Which Flutter InAppWebView callback observes each test

> `onConsoleMessage` is the workhorse: **all** JS errors, promise rejections, and
> `console.*` calls reach Flutter through it. The dedicated *load-error* callbacks
> fire for **navigations/resource loads the WebView performs**, not for JS
> exceptions or (usually) `fetch()` XHR.

| Test | Expected browser result | Flutter callback |
|------|-------------------------|------------------|
| JS exception (JS-001) | Console error | `onConsoleMessage` |
| TypeError (JS-002) | Console error | `onConsoleMessage` |
| Promise rejection (PROMISE-001) | Console error | `onConsoleMessage` |
| HTTP 404 (NETWORK-002) | HTTP error | `onReceivedHttpError` (when the WebView loads the URL) |
| Invalid domain (NETWORK-001) | Network error | `onReceivedError` (when the WebView loads the URL) |
| Large memory (MEM-001/002) | Memory pressure | Possibly `onRenderProcessGone` |
| Infinite loop (CPU-001) | WebView frozen | Platform dependent |
| Large DOM (MEM-003) | Memory/CPU pressure | Platform dependent |
| WebGL stress (WEBGL-001) | Graphics pressure | Platform dependent |
| Page navigation error (LIFECYCLE-002) | Load error | `onLoadError` / `onReceivedError` |
| Camera permission (PERMISSION-003) | Permission request | WebView permission handling (`onPermissionRequest`) |

Other useful callbacks the page exercises: `onLoadStart`, `onLoadStop`
(reload/navigate), `onWebViewCreated`, `onLoadHttpError`.

Two globals are always installed (see `app.js`) so **any** stray error is visible
to `onConsoleMessage`:

```js
window.addEventListener("error", (e) =>
  console.error("GLOBAL_JS_ERROR", e.message, e.filename, e.lineno, e.colno));

window.addEventListener("unhandledrejection", (e) =>
  console.error("GLOBAL_UNHANDLED_REJECTION", e.reason));
```

### Minimal Flutter wiring (reference)

```dart
onConsoleMessage: (controller, msg) {
  // msg.messageLevel: LOG / WARNING / ERROR / DEBUG / TIP
  FirebaseCrashlytics.instance.log("WEBVIEW ${msg.messageLevel}: ${msg.message}");
},
onReceivedError: (controller, request, error) {
  FirebaseCrashlytics.instance.log("onReceivedError: ${request.url} ${error.description}");
},
onReceivedHttpError: (controller, request, response) {
  FirebaseCrashlytics.instance.log("onReceivedHttpError: ${request.url} ${response.statusCode}");
},
onRenderProcessGone: (controller, detail) {
  FirebaseCrashlytics.instance.recordError(
    "onRenderProcessGone didCrash=${detail.didCrash}", null, fatal: true);
},
```

---

## 5. Which tests may freeze the WebView

These block the main thread; the WebView will be unresponsive until they finish (or forever):

- **CPU-001 Infinite Loop** — **never recovers.** Only reloading/closing the WebView clears it.
- **CPU-002 CPU Stress (10 s)** — frozen ~10 s, then recovers.
- **LIFECYCLE-004 Freeze UI (5 s)** — frozen ~5 s, then recovers.
- **JS-005 Stack Overflow** — brief freeze; may crash the renderer.
- **MEM-003 Large DOM**, **CPU-003 Animation Stress**, **RENDERER-001** — heavy jank/near-freeze under pressure.

---

## 6. Which tests may cause renderer termination

There is **no portable, guaranteed** way for a web page to kill a WebView renderer
process. The following *may* lead the OS/WebView to terminate the renderer
(surfacing as `onRenderProcessGone`), but it is **device- and platform-dependent**:

- **MEM-001** large allocations (500 MB / 1 GB)
- **MEM-002** memory leak (left running)
- **MEM-004** large canvases
- **WEBGL-001** GPU resource stress (may instead only lose the WebGL context)
- **RENDERER-001** combined stress (designed to maximize the chance, still not guaranteed)

---

## 7. Why JavaScript errors are different from renderer crashes

- A **JavaScript error** (uncaught exception, promise rejection, `console.error`)
  is an *in-page* event. The renderer keeps running; the error is reported to
  `window.onerror` / `unhandledrejection` and the console. Flutter sees it through
  **`onConsoleMessage`** — **not** through load-error or process-gone callbacks.
- A **renderer crash / process-gone** is an *out-of-process* event: the OS kills the
  WebView's renderer process (out-of-memory, GPU fault, native crash). Flutter sees
  it through **`onRenderProcessGone`**, and the page's JS is gone entirely.

So: **do not treat a thrown JS exception as a renderer crash.** They are captured by
different callbacks and mean different things. This lab keeps them clearly separated.

---

## 8. How to correlate test IDs with Flutter logs

Every test logs a marker before triggering its failure:

```
[TEST: MEM-001] Large memory allocation started
```

The same `[TEST: <ID>]` string appears in:

1. The **on-page event log** (bottom of the page) — timestamp, level, ID, message. Use **Copy Logs** to grab it all.
2. The **browser console** (via `console.*`), which Flutter receives in `onConsoleMessage`.

Suggested Flutter/Crashlytics pattern: parse the `[TEST: <ID>]` token out of
`msg.message` and attach it as a Crashlytics custom key, so each website action maps
to a searchable key in the Crashlytics dashboard:

```dart
final m = RegExp(r'\[TEST: ([A-Z]+-\d+)\]').firstMatch(msg.message);
if (m != null) FirebaseCrashlytics.instance.setCustomKey("webview_test_id", m.group(1)!);
```

---

## Pipeline

```
Web Test
  → JavaScript error / console.error / WebView failure
  → Flutter InAppWebView
  → onConsoleMessage / onRenderProcessGone / error callbacks
  → Flutter logging
  → Firebase Crashlytics
```

Firebase is intentionally **not** part of this website — the Flutter app owns
Crashlytics. This page only generates the browser/WebView errors.
