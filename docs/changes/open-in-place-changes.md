# Open in place: change matrix

Spec: `docs/features/open-in-place.md`. One commit per phase on `feat/open-in-place`. To remove a phase, revert its commit (from the bottom up). New renderer code lives in `src/openInPlace/`; the main process side is `electron/diskFiles.cjs`, `electron/fileArgs.cjs`, `electron/windowRegistry.cjs` (and `electron/bookScan.cjs` from phase 3). Touch points outside those are listed in `openInPlaceFeature` (`src/openInPlace/index.ts`).

## Phases

| Phase | Version | What it adds | Existing files touched | Revert notes |
|---|---|---|---|---|
| 1. Main process | 0.137.0 | One running copy of the app; files from the command line, a second launch and macOS `open-file` open in light windows (same file focuses its window; MOBI, AZW3, TXT, MD queue for the main window's ordinary import); a list of open windows sent to every window; `files:*` and `windows:*` bridge; hashes in `disk-files.json`; PDF and EPUB file associations | `electron/main.cjs`, `electron/preload.cjs`, `src/sync/desktopBridge.ts`, `src/features/registry.ts`, `package.json` (`build.fileAssociations`), `package-lock.json`, `VERSION`, `CHANGELOG.md` | Reverting restores the old single window. `disk-files.json` stays in user data, harmless. |
