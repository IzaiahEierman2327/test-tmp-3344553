# Puzzle Hunt Workbench v0.1.3

Windows portable packaging correction.

Highlights:

- Windows no longer publishes the single-file `Windows-Portable.exe` artifact.
- The canonical Windows portable build is now `Puzzle-Hunt-Workbench-0.1.3-Windows-Portable-x64.zip`.
- The portable ZIP contains the complete unpacked application directory. Extract it and run `Puzzle Hunt Workbench.exe`; no installer or uninstaller is involved.
- The archive copy carries a portable marker that keeps its default `Puzzle Hunt Workbench Data` folder beside the extracted application directory.
- The NSIS `Windows-Setup.exe` installer is built before the portable marker is added, so installed copies keep normal installed-app data behavior.
- Runtime support for the older v0.1.1/v0.1.2 single-exe portable environment is retained for users who keep those builds.
- The v0.1.2 cache, login/session, submission, clipboard, lifecycle, migration and security changes are otherwise unchanged.

Manual testing requested after release:

1. Download and extract `Windows-Portable-x64.zip`; confirm it is a normal application directory, not another self-extracting portable executable.
2. Launch `Puzzle Hunt Workbench.exe` directly from the extracted folder without installing anything.
3. Confirm the default `Puzzle Hunt Workbench Data` directory appears beside the extracted portable copy.
4. Move the extracted portable folder to another writable location and launch it again.
5. Install `Windows-Setup.exe` separately and confirm the installed copy does not default to a portable data directory beside its executable.
6. Re-check login persistence, form submission behavior, cache fallback and clipboard copy from v0.1.2.

The application remains unsigned/not notarized, so Windows/macOS may show an unknown-publisher warning.

## v0.1.2

Hardening & browser-semantics release: exact-URL GET/2xx snapshots, safe POST semantics, last-known-good outage fallback, persistent browser-session flushing, clipboard support, Tool sleeping fixes, macOS lifecycle fixes, recoverable state/data migration, IPC/permission hardening and real Electron smoke coverage.

## v0.1.1

Portable and storage-control update: clearly named Setup/Portable artifacts, selectable Windows install location and configurable application-data storage. The Windows portable artifact at this point was still electron-builder's single-file self-extracting `.exe` target; v0.1.3 corrects that distribution format.

## v0.1.0

First functional MVP: persistent Puzzle + Canvas areas, multi-tab Puzzle browsing, vertical sleeping Tools, semi-transparent Tool pop-out, MHTML offline fallback, persistent browser session, hunt workspaces and three-platform packaging.
