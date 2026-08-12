# Architecture

Puzzle Hunt Workbench is an Electron desktop application built around three web-content roles:

- **Puzzle** — a persistent multi-tab browser. Puzzle tabs remain alive while switching tabs.
- **Canvas** — one persistent browser surface intended for Google Sheets/Docs, Excalidraw, Notion, or another user-provided URL.
- **Tools** — a vertical auxiliary surface. Inactive or hidden Tool tabs may be destroyed after an idle timeout and recreated from their saved URL.

## Process and trust boundaries

The local Electron renderer owns only application chrome: URL bars, tab strips, splitters, settings, workspace controls and status. It receives a narrow preload API.

Remote pages are separate `WebContentsView`/`BrowserWindow` web contents with:

- Node integration disabled;
- sandboxing enabled;
- context isolation enabled;
- web security enabled;
- no application preload bridge.

IPC handlers reject calls whose sender is not the trusted local `src/ui/index.html` renderer. Remote permission requests use a conservative allowlist.

## Browser session

Puzzle, Canvas and Tool pages share `persist:puzzle-hunt-workbench`. This preserves normal persistent cookies and web storage across restarts. Shutdown/restart flushes the cookie store and DOM storage before the process exits. Site-defined session cookies remain session-scoped.

The session data path is moved together with the app data root before Electron creates the persistent session.

## Puzzle snapshot policy

The application tracks the main-frame HTTP request associated with each remote `WebContents` using Electron `webRequest` metadata.

A page is automatically snapshot-cacheable only when:

1. it is an HTTP(S) main-frame navigation;
2. the method is `GET`;
3. the final status is 2xx;
4. the request URL matches the displayed normalized URL.

Snapshots are MHTML files keyed by a canonical URL with the fragment removed. Cache metadata always records the source URL.

POST/form submissions are deliberately outside the offline-cache replay model. A POST may execute normally and, if the server redirects to a later GET result page, only that GET page is eligible for a snapshot.

HTTP 429/5xx responses never replace the last-known-good snapshot. If automatic fallback is enabled, a fresh snapshot for the exact same GET URL can be opened instead. Network failures use the same exact-URL/GET/freshness checks.

## Persistence

Workspace/config state is written through a serialized atomic-write queue. A failed write is returned to the caller but does not poison later queued saves.

Application-data relocation is a recoverable copy-and-switch transaction at the bootstrap level:

1. keep the current data root active;
2. record a pending `{from,to}` migration;
3. on the next launch, attempt the recursive copy before creating the persistent browser session;
4. commit the target as the new data root only after the copy succeeds;
5. on failure, keep the old root active and record the migration error so the application can still start.

## Clipboard

Remote Puzzle, Canvas and Tool web contents retain normal Chromium selection behavior. The app explicitly handles Ctrl/Cmd+C and exposes native context-menu roles for Copy and editable Cut/Paste/Select All operations.

## Window lifecycle

Windows/Linux quit when the final window closes. macOS keeps the application alive after the main window closes and recreates the main window on `activate`.

## Validation layers

- Pure unit tests cover URL/cache policy, cache freshness, layout, workspace state, Tool sleeping, state-store recovery, data migration and platform lifecycle policy.
- The Electron smoke test starts a local HTTP server and real `WebContentsView`, then verifies persistent-session creation, MHTML writing, clipboard copying, successful GET cacheability, 5xx rejection and POST rejection.
- Release CI builds Windows, macOS and Linux artifacts; Linux additionally executes the Electron smoke test under Xvfb.

See `docs/ROADMAP.md` for the versioned acceptance plan.
