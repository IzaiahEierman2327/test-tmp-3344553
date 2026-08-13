# Puzzle Hunt Workbench v0.1.4

Windows portable runtime hotfix.

Highlights:

- Fixes the Windows portable startup failure that could emit Chromium/Electron `Unable to move the cache`, `Unable to create cache`, `Gpu Cache Creation failed`, and Windows `Access Denied (0x5)` errors after extracting v0.1.3.
- Portable durable data and Chromium runtime/cache data are now separated instead of sharing the same directory root.
- The portable app still keeps workspace state and puzzle snapshots in `Puzzle Hunt Workbench Data` beside the extracted executable.
- Remote Puzzle/Canvas/Tool browser storage now uses a dedicated persistent `Puzzle Hunt Workbench Data/browser-session` directory. Cookies, local storage and other site storage can remain with the portable folder.
- The portable browser session disables Chromium's HTTP disk cache; Puzzle Hunt Workbench's own MHTML puzzle snapshots remain available and unchanged.
- Disposable Electron/Chromium runtime `sessionData` is redirected to a unique OS temporary directory for portable launches, preventing runtime disk/GPU cache directories from colliding with durable application data.
- The portable bootstrap/config file is now read beside the portable executable. A bootstrap left in the machine's global application-data directory by an installed or older build no longer overrides the portable copy.
- Startup now performs a write-and-rename probe on the selected portable data location so unwritable extraction locations fail explicitly rather than silently switching away from portable storage.
- The Windows release workflow now extracts the final portable ZIP and launches the packaged `Puzzle Hunt Workbench.exe` in smoke-test mode. It verifies portable detection, durable data placement, persistent browser-session storage, isolation from a machine-global bootstrap, and absence of the reported Chromium disk-cache creation errors.
- Installed builds keep the existing `persist:puzzle-hunt-workbench` browser partition so v0.1.4 does not intentionally reset normal installed-app login state.

Manual testing requested after release:

1. Fully extract `Puzzle-Hunt-Workbench-0.1.4-Windows-Portable-x64.zip` to a normal writable folder and launch `Puzzle Hunt Workbench.exe` without administrator privileges.
2. Confirm the application opens without the v0.1.3 `disk_cache` / `Gpu Cache Creation failed` errors.
3. Confirm `Puzzle Hunt Workbench Data` appears beside the executable and contains a `browser-session` directory after browsing.
4. Log in to a normal website, close the app normally, relaunch it, and confirm the site's persistent login survives when the site itself uses persistent browser storage.
5. Move the entire extracted portable folder to another writable location and confirm the workspace data and browser session move with it.
6. If an installed copy or an older build has a custom data location, confirm the fresh portable ZIP still defaults to its own adjacent data directory instead of inheriting that machine-global setting.
7. Re-check puzzle MHTML save/fallback behavior, form submissions, clipboard copy and Tool/Canvas browsing.

The application remains unsigned/not notarized, so Windows/macOS may show an unknown-publisher warning.

## v0.1.3

Introduced the canonical archive-based Windows portable ZIP and removed the old single-file `Windows-Portable.exe`. Its packaging format was correct, but its runtime storage layout placed Electron/Chromium `sessionData` directly in the portable application-data root. On affected Windows systems this could cause disk/GPU cache creation failures and prevent a usable launch. v0.1.4 replaces that runtime layout and adds a packaged-Windows launch gate.

## v0.1.2

Hardening & browser-semantics release: exact-URL GET/2xx snapshots, safe POST semantics, last-known-good outage fallback, persistent browser-session flushing, clipboard support, Tool sleeping fixes, macOS lifecycle fixes, recoverable state/data migration, IPC/permission hardening and real Electron smoke coverage.

## v0.1.1

Portable and storage-control update: clearly named Setup/Portable artifacts, selectable Windows install location and configurable application-data storage. The Windows portable artifact at this point was still electron-builder's single-file self-extracting `.exe` target; v0.1.3 corrected that distribution format.

## v0.1.0

First functional MVP: persistent Puzzle + Canvas areas, multi-tab Puzzle browsing, vertical sleeping Tools, semi-transparent Tool pop-out, MHTML offline fallback, persistent browser session, hunt workspaces and three-platform packaging.
