# Puzzle Hunt Workbench

Puzzle Hunt Workbench is a desktop solving environment for puzzle hunts. It keeps the two things that need the most screen space—**puzzle pages** and a **working canvas**—visible side by side, while keeping web-based solving tools available in a vertical dock or a semi-transparent pop-out window.

## Core workflow

- **Puzzle**: persistent multi-tab browser. Tabs stay alive while you switch between them.
- **Canvas**: one persistent browser surface for Google Sheets, Google Docs, Excalidraw, Notion, or any URL you choose.
- **Tools**: a vertical right-side dock with tabs, favorites, adjustable width, and a pop-out mode.
- **Tool sleeping**: inactive or hidden tool tabs are destroyed after an adjustable idle timeout and recreated from their saved URL when selected again. Puzzle tabs and Canvas are not subjected to this policy.
- **Puzzle cache**: successful cacheable Puzzle loads are saved as local MHTML snapshots. Cache retention is configurable; when a hunt site is unreachable or returns an outage response the app can fall back to a fresh snapshot for that exact page URL.
- **Hunt workspaces**: optional activity-level workspaces. Only one hunt workspace is active at a time; each workspace remembers its Puzzle tabs, Canvas URL, Tools, and favorites.

## Login and browser-session behavior

Puzzle, Canvas and Tool pages share one persistent Electron browser session. Persistent cookies, local storage, IndexedDB and other normal browser storage are explicitly flushed during a normal shutdown/restart.

Installed builds continue to use the existing `persist:puzzle-hunt-workbench` partition. Windows archive-portable builds use a dedicated `Puzzle Hunt Workbench Data/browser-session` storage directory so durable website state moves with the portable folder while Electron/Chromium's disposable runtime cache remains separate.

The Windows portable browser session disables Chromium's HTTP disk cache to avoid mixing browser cache internals with portable durable data. This does not disable Puzzle Hunt Workbench's own MHTML puzzle snapshots.

This means normal "remember me" / persistent logins can survive application restarts. A website can still intentionally issue a **session-only cookie**; Electron/Chromium does not retain such cookies between browser sessions, and Puzzle Hunt Workbench does not rewrite a site's cookie lifetime.

Changing the application-data directory moves the workspace state, puzzle snapshots and portable browser-session data together.

## Puzzle cache semantics

The cache is a resilience feature, not a replay engine.

- Only **main-frame HTTP(S) `GET` pages with a successful 2xx response** are automatically snapshot-cached.
- Cache entries are bound to the exact normalized page URL. A cache for Puzzle A can never be used as the cache for Puzzle B.
- URL fragments (`#section`) share the same underlying snapshot key.
- **POST/form/answer submissions are never automatically cached and are never replayed by offline fallback.**
- If a POST submission redirects to a normal GET result page, the GET result page may be cached like any other display page.
- HTTP `429` and `5xx` outage/error responses are not allowed to replace a last-known-good snapshot. When automatic fallback is enabled and a fresh cache exists for the exact same GET URL, the cached page may be shown instead.
- `404` is not treated as an automatic outage fallback because it can be a legitimate application response.
- MHTML captures the rendered page and its captured resources. Server-side actions and later network/API calls cannot run while viewing an offline snapshot.

The **Save** button refreshes the snapshot only when the currently displayed navigation is cacheable under the same GET/2xx rules.

## Clipboard support

Puzzle, Canvas and Tool web pages support normal system clipboard copying. Selected text can be copied with **Ctrl+C** on Windows/Linux or **Cmd+C** on macOS. Remote pages also have a native context menu with Copy and, for editable fields, Cut/Paste/Select All actions.

## Portable builds and installation

Windows releases intentionally provide two different distribution forms:

- `...Windows-Setup.exe`: assisted installer. It installs the application and allows the installation directory to be changed during setup.
- `...Windows-Portable-x64.zip`: a real archive-based portable build. Extract the ZIP fully and run `Puzzle Hunt Workbench.exe` from the extracted `Puzzle Hunt Workbench` folder. It does not install the application or create an uninstaller.

The Windows portable archive contains a small marker file that tells Puzzle Hunt Workbench to keep its default durable application data in a `Puzzle Hunt Workbench Data` folder beside that extracted portable copy. Moving the extracted folder therefore moves the default portable workspace data, puzzle snapshots and browser-session storage with it. If you explicitly choose a different application-data location in Settings, that portable-local choice takes precedence.

Starting with v0.1.4, the portable bootstrap/config file is also portable-local instead of being inherited from the machine-global application-data directory. Disposable Chromium `sessionData` is isolated in an OS temporary directory during a portable launch, while durable site storage remains in `Puzzle Hunt Workbench Data/browser-session`. This avoids the v0.1.3 Windows disk/GPU cache startup failure.

The old v0.1.1/v0.1.2 `Windows-Portable.exe` was electron-builder's single-file self-extracting portable target. Starting with v0.1.3 it is no longer published; the archive-based ZIP is the canonical Windows portable distribution.

On macOS, the `.zip` build can be unpacked and run without an installer; the `.dmg` is the normal distribution image. On Linux, both `.AppImage` and `.tar.gz` are no-installer distribution options.

## Application data location

Settings shows the currently active application-data folder and lets you choose a different parent directory. The app creates/uses a dedicated `Puzzle Hunt Workbench Data` folder there.

Changing the location schedules a **copy-and-switch** migration and requires a restart. The previous data folder remains the active fallback until the copy succeeds. If migration fails because a target drive is unavailable, full, or not writable, the app continues with the old data folder and retries the pending migration on a later start instead of refusing to launch.

Portable mode performs a write-and-rename probe before using its selected data directory. If the extracted location is not writable, the app reports that portable storage is unavailable rather than silently switching to a machine-global data location.

## Security model

Remote pages run with Node integration disabled, context isolation and sandboxing enabled, and a shared persistent browser session. IPC exposed by the preload is accepted only from the trusted local application chrome. Remote permission requests use a conservative allowlist.

## Tool pop-out opacity

The tool pop-out opacity is adjustable from 35% to 100%. Electron/OS support for window opacity can vary under some Linux window managers/Wayland configurations; Windows and macOS support the setting directly.

## Development

```bash
npm install
npm run check
npm start
```

Linux Electron integration smoke test:

```bash
PHW_SMOKE_TEST=1 xvfb-run -a npx electron . --no-sandbox
```

The smoke test launches real Electron web contents against a local HTTP server and checks persistent-session creation, cookie/browser-storage writes, MHTML saving, clipboard copy, HTTP status handling and GET-vs-POST cache policy.

Package the current platform:

```bash
npm run dist
```

On Windows this command builds the NSIS Setup executable plus the archive-based portable ZIP. The Windows release workflow then extracts the final ZIP and launches the packaged executable in smoke-test mode before allowing a release. On macOS/Linux it builds the configured platform artifacts.

## Release process

Pull requests to `main` run source/unit checks and Windows, macOS and Linux packaging. A successful version-changing merge to `main` builds all three platforms and creates the GitHub Release matching `package.json` (currently `v0.1.4`).

See `docs/ROADMAP.md` for shipped history beginning at v0.1.0 and the planned development trajectory.

This project is not affiliated with any puzzle hunt or tool website.
