# Puzzle Hunt Workbench roadmap

This roadmap records both shipped history and the intended development trajectory. A version is considered validated only when its listed automated checks pass and the release artifacts are published successfully.

## v0.1.0 — Functional MVP (historical)

Goal: prove the core puzzle-hunt desktop workflow.

Shipped scope:

- Electron desktop shell with persistent Puzzle + Canvas main areas.
- Draggable Puzzle/Canvas split.
- Multi-tab Puzzle browser; inactive Puzzle tabs remain alive.
- Vertical Tools dock with tabs, favorites, pop-out, opacity and idle sleeping.
- MHTML Puzzle snapshots, retention, manual Live/Cache switching and outage fallback.
- Persistent shared browser session for Puzzle, Canvas and Tools.
- Event-level Hunt workspaces with exactly one active workspace.
- Windows/macOS/Linux packaging through GitHub Actions.

Historical limitation: several acceptance statements were backed mainly by unit tests and a startup smoke test rather than full Electron interaction tests.

## v0.1.1 — Portable & storage controls (historical)

Goal: make test/distribution workflows practical.

Shipped scope:

- Clearly named Windows Setup and Portable artifacts.
- Assisted Windows installer with selectable installation directory.
- Portable default data folder beside the executable.
- Configurable application-data location with restart-time migration.
- macOS ZIP and Linux AppImage/tar.gz no-installer artifacts.

Known limitation carried forward: migration and cache semantics needed stronger failure recovery and integration coverage.

## v0.1.2 — Hardening & browser semantics (current)

Goal: establish a trustworthy baseline before adding broader product features.

Required scope:

- Cache is bound to the exact normalized page URL.
- Automatic snapshots are limited to successful main-frame HTTP(S) GET responses.
- POST/form submissions are never automatically snapshot-cached or replayed through offline fallback.
- HTTP 429/5xx outage responses cannot overwrite a last-known-good snapshot; eligible GET pages may fall back to an existing fresh snapshot.
- Shared `persist:` Electron session is retained across restarts and explicitly flushed before shutdown/data migration. Site-defined session-only cookies remain session-only by design.
- Puzzle, Canvas and Tool pages support normal system clipboard copy plus native edit/copy/paste context menus where applicable.
- Hidden Tool tabs become eligible for sleeping after the configured idle timeout.
- macOS close/activate behavior recreates the main window correctly without treating window close as application quit.
- State writes recover after transient write failures.
- Data-folder migration is copy-and-switch, recoverable, and falls back to the old data root if migration fails.
- IPC sender validation and a conservative remote permission policy are enabled.
- Real Electron smoke coverage validates persistent-session creation, MHTML saving, clipboard copy, GET/POST cache policy and 5xx behavior against a local HTTP server.
- Release/version behavior is tightened so an unchanged package version cannot silently create a new logical release.

Manual acceptance after release:

- Log into at least one real hunt/tool site, restart the app and verify the site remains logged in when the site uses persistent authentication storage.
- Submit a real form/answer and verify the submission executes normally; verify the POST itself is not exposed as an offline snapshot.
- Disconnect the network or stop a test server and verify a cached GET puzzle page opens without showing a different URL's cache.
- Select text in Puzzle, Canvas and Tool pages and copy it with Ctrl/Cmd+C and the context menu.
- On macOS, close the main window and reopen it from the Dock.
- Exercise data-folder migration, including an intentionally unavailable target if practical.

## v0.2.0 — Browser quality & cache observability (planned)

Focus: make everyday hunt browsing easier to understand and debug.

Candidate scope:

- Cache history/metadata viewer with snapshot timestamps and explicit last-known-good status.
- Clear per-page cache controls and visible reasons when a page is not cacheable (POST, error response, unsupported scheme).
- Download manager and download-location controls.
- Better tab ergonomics: rename, duplicate, pin/reorder and restore recently closed tabs.
- Keyboard shortcut customization and command palette.
- Replace direct `file://` snapshot loading with a controlled application scheme if MHTML compatibility permits.
- Expanded cross-platform Electron integration tests, including Windows and macOS lifecycle tests.

## v0.3.0 — Hunt setup & reusable tools (planned)

Focus: reduce setup work at the start of a hunt.

Candidate scope:

- Hunt workspace templates and import/export.
- Reusable Tool catalog/presets with names, icons and recommended sizes.
- Per-hunt startup layouts and favorite sets.
- Optional URL rules for opening known tool links in Tools vs Puzzle tabs.
- Improved workspace backup/restore and portable handoff.

## v0.4.0 — Power-user workflow (planned)

Focus: faster operation during active competition.

Candidate scope:

- Global/local hotkeys for tab switching, Tools and cache actions.
- Search across open Puzzle/Tool tabs and workspace metadata.
- Session diagnostics for cache/session/storage health.
- Optional lightweight extensions/hooks that do not inject privileged Node APIs into remote pages.

## v1.0.0 — Stable public release (future)

Release criteria:

- Signed Windows builds and signed/notarized macOS builds.
- Stable update/migration policy with rollback guarantees.
- Broader accessibility and keyboard-navigation review.
- Automated release provenance/checksums and reproducible dependency lock.
- Security review of navigation, permissions, IPC and snapshot handling.
- Mature end-to-end coverage on Windows, macOS and Linux.
- No known data-loss or cross-page cache correctness issues.

## Versioning policy

- `0.1.x`: correctness and stabilization of the original MVP.
- `0.2.x`–`0.4.x`: additive product work while interfaces and data structures may still evolve.
- `1.0.0`: stable storage/migration behavior and public-distribution readiness.
