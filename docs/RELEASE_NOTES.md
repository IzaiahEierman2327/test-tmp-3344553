# Puzzle Hunt Workbench v0.1.2

Hardening & browser-semantics release.

Highlights:

- Puzzle snapshots are now bound to the exact normalized URL.
- Automatic snapshots are created only for successful main-frame HTTP(S) `GET` responses.
- Form/answer `POST` submissions are never automatically cached or replayed through offline fallback.
- HTTP 429/5xx outage responses cannot overwrite a last-known-good puzzle snapshot.
- Fresh cached GET pages may automatically replace an outage response when fallback is enabled.
- Puzzle, Canvas and Tool pages support system clipboard copy and native edit/copy/paste context menus.
- The shared `persist:` browser session is explicitly flushed at shutdown/restart so persistent cookies and web storage survive normal restarts. Sites that intentionally issue session-only cookies can still require a new login after a full application restart.
- Hidden Tools are eligible for idle sleeping instead of keeping the selected hidden tool alive forever.
- macOS window close/activate behavior has been corrected.
- State persistence recovers after a transient write failure.
- Data-folder relocation is now a recoverable copy-and-switch migration; a failed migration keeps using the previous data folder instead of blocking startup.
- IPC calls are restricted to the trusted local chrome renderer and remote web permissions use a conservative allowlist.
- The Linux Electron smoke test now exercises a local HTTP server, persistent sessions, MHTML creation, clipboard copy, HTTP status handling and GET-vs-POST cache policy instead of only launching for a few seconds.
- The project roadmap now records v0.1.0/v0.1.1 history and the planned v0.2.x–v1.0 trajectory.

Manual testing requested after release:

1. Log into a real hunt/tool site, restart, and verify persistent-authentication sites remain logged in.
2. Submit a real answer/form and verify it executes normally; the POST itself must not become an offline snapshot.
3. Verify an unavailable/5xx GET puzzle page falls back only to a cache of that same URL.
4. Copy selected text from Puzzle, Canvas and Tool pages using Ctrl/Cmd+C and the context menu.
5. On macOS, close the main window and reopen it from the Dock.
6. Exercise application-data relocation and restart.

The application remains unsigned/not notarized, so Windows/macOS may show an unknown-publisher warning.

## v0.1.1

Portable and storage-control update: clearly named Setup/Portable artifacts, selectable Windows install location and configurable application-data storage.

## v0.1.0

First functional MVP: persistent Puzzle + Canvas areas, multi-tab Puzzle browsing, vertical sleeping Tools, semi-transparent Tool pop-out, MHTML offline fallback, persistent browser session, hunt workspaces and three-platform packaging.
