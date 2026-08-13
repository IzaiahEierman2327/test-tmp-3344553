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

Historical packaging mistake: Windows "Portable" used electron-builder's single-file self-extracting `.exe` target. It required no installation, but did not match this project's intended archive-based portable distribution model.

## v0.1.2 — Hardening & browser semantics (historical)

Goal: establish a trustworthy baseline before adding broader product features.

Shipped scope:

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

## v0.1.3 — True Windows portable archive (historical)

Goal: correct the Windows portable distribution format.

Shipped scope:

- Kept `Windows-Setup.exe` as the assisted installer.
- Stopped publishing the single-file `Windows-Portable.exe` artifact.
- Published `Windows-Portable-x64.zip` containing the complete unpacked application directory.
- Only the ZIP copy carried the portable marker; Setup did not.
- Preserved compatibility with the older `PORTABLE_EXECUTABLE_DIR` environment used by the v0.1.1/v0.1.2 single-exe build.

Historical runtime defect: the archive format was correct, but portable `userData` and Chromium `sessionData` shared the same `Puzzle Hunt Workbench Data` root. On affected Windows systems Chromium could fail to create/move disk or GPU cache files with `Access Denied (0x5)`. The release workflow validated ZIP structure but did not actually launch the packaged Windows portable executable, so this defect escaped automation.

## v0.1.4 — Windows portable runtime isolation (current)

Goal: make the archive-based Windows portable build actually launch reliably while preserving portable browser state.

Required scope:

- Keep workspace state and puzzle snapshots in `Puzzle Hunt Workbench Data` beside the extracted executable by default.
- Keep portable browser cookies/local storage/IndexedDB in a dedicated persistent `Puzzle Hunt Workbench Data/browser-session` directory.
- Use `session.fromPath(...)` for the portable remote-browser session and disable Chromium HTTP disk cache for that session.
- Redirect disposable Electron/Chromium runtime `sessionData` to a unique OS temporary directory during portable launches.
- Keep installed builds on the existing `persist:puzzle-hunt-workbench` partition so installed login state is not intentionally reset.
- Store/read the portable bootstrap beside the portable executable instead of inheriting machine-global app-data configuration.
- Probe portable data locations with an actual write-and-rename operation before use.
- Extract and launch the final Windows portable ZIP in GitHub Actions, not merely inspect its contents.
- Packaged smoke must validate portable detection, adjacent durable data, persistent browser-session storage, independence from machine-global bootstrap state, and absence of the reported Chromium disk-cache creation errors.

Manual acceptance after release:

- Fully extract the ZIP to a normal writable directory and launch without administrator privileges.
- Confirm there are no `Unable to move the cache`, `Unable to create cache`, or `Gpu Cache Creation failed` startup errors.
- Confirm `Puzzle Hunt Workbench Data/browser-session` is created and normal persistent website login survives a clean restart when the website uses persistent browser storage.
- Move the whole portable folder and verify workspace plus browser state move with it.
- Confirm a machine-global custom data setting from an installed/older copy does not override a fresh portable copy.
- Re-run puzzle MHTML cache, POST/form submission, clipboard and Tool/Canvas acceptance checks.

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

- `0.1.x`: correctness and stabilization of the original MVP, including distribution-format and portable-runtime corrections.
- `0.2.x`–`0.4.x`: additive product work while interfaces and data structures may still evolve.
- `1.0.0`: stable storage/migration behavior and public-distribution readiness.
