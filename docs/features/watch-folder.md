# Watched folder: automatic book import

Roadmap id: `watch-folder` · Area: Formats and export · Status: idea · Depends on: `sync-v10` (folder access bridge), `blob-store` (content hashes); more formats from `formats-simple` · Enables: `device-scan`

## 1. Purpose

Readers keep books in a folder (Downloads, a Calibre library, a cloud-synced "Arabic books" folder). Adding each by hand is tedious and easy to forget. The reader should be able to point the app at a folder once and find new books in the library automatically.

## 2. Expected Behaviour

- Settings → Library & data → **Watched folders**: **Add folder** (folder picker), list of folders with their status, **Scan now**, **Remove**.
- Options per folder:
  - **Include subfolders** (default on).
  - **When a file is removed from the folder**: *Keep the book* (default) or *Remove the book too* (asks once per removal batch: "3 books' files were removed from 'Arabic'. Remove them from the library?").
- What is imported: files whose extension the app can import (EPUB now; TXT/MD/MOBI/AZW3/PDF when those importers exist). Hidden files and files under 1 KB are ignored.
- **Copy, not reference:** each found book is copied into the app's storage, so a book never disappears because something happened to the folder. The library entry remembers its source path.
- **Duplicates:** a file whose content hash matches a book already in the library is not imported again; a file with the same hash in two folders is imported once.
- **When scans happen:**
  - Desktop (Electron): continuously; a new or changed file is imported within 10 seconds of the copy finishing (wait until the file size is stable for 3 seconds).
  - Android: when the app opens and when it returns to the foreground, plus Scan now.
  - iOS: when the app opens and on Scan now, for folders the reader picked (security-scoped bookmarks).
  - Web (browser): Chrome/Edge with the File System Access API on desktop only, on app open and Scan now, after the browser's permission prompt; other browsers: the section explains it is not available.
- New books appear at the top of the library with a "New" badge and a toast "2 books added from 'Arabic'". Import errors are listed in the folder's status ("1 file could not be imported: X.mobi — protected (DRM)").

## 3. User Flows

1. Desktop → Settings → Watched folders → Add `D:\Books\Arabic` → scan finds 40 EPUBs → progress → 40 books (2 duplicates skipped).
2. Later the reader downloads a book into the folder → 10 seconds later it is in the library with "New".
3. Android → add folder via the system picker → open the app next day → new files imported.

## 4. UI / UX Behaviour

- Folder row: path (shortened), last scan time, counts (imported, skipped, failed), a spinner while scanning.
- First scan of a large folder: progress "Importing 12 of 40…", can be cancelled; already imported files stay.
- Permission lost (iOS/web): row shows "Permission needed" with a button to re-grant.

## 5. Data & State

- New local-only table `watchedFolders` (id, platform handle/bookmark/URI, displayPath, includeSubfolders, onRemoval, lastScanAt, stats). **Not synced**: paths are device-specific. Schema bump + migration test.
- New local-only table `folderFiles` (folderId, relativePath, size, mtime, contentHash, bookId) to know what was seen and imported.
- `BookMeta.contentHash?: string` (synced, so two devices recognise the same book) — coordinate with `blob-store`, which owns hashing.

## 6. Technical Requirements

- **Electron:** extend `electron/main.cjs` and `preload.cjs` with a `book-folders:*` bridge (choose, list recursively with size/mtime, read file, watch with `fs.watch`/chokidar-like debounce). Follow the existing `sync-folder:*` bridge (`electron/syncFolder.cjs`) for structure and security (only paths the user chose).
- **Android:** Storage Access Framework tree URI with persisted permission (`takePersistableUriPermission`), via a small Capacitor plugin; list documents recursively.
- **iOS:** document picker for folders, security-scoped bookmark stored and resolved on launch, via a small Capacitor plugin.
- **Web:** `showDirectoryPicker` handle stored in IndexedDB; `queryPermission`/`requestPermission` on each scan.
- One scanner module `src/watchFolder/` with a platform adapter interface `{ choose(), list(handle), read(handle, path), watch?(handle, onChange) }` and the import logic shared.
- Hashing: SHA-256 of file bytes via `crypto.subtle` (the BlobStore's hash function when it exists).
- Import goes through `libraryService.importBook` (from `formats-simple`) or `importEpub`.

## 7. Edge Cases & Error Handling

- File still being copied: size-stable check before reading.
- Folder unavailable (USB drive unplugged, cloud folder offline): status "Folder not available", no removals triggered.
- Renamed or moved file inside the folder: same hash → update `folderFiles`, no new book.
- File modified (new edition): different hash → imported as a new book; the old one stays (the reader can remove it).
- Thousands of files: scan in batches; never block the UI.

## 8. Acceptance Criteria

- On Electron, a file copied into a watched folder is imported within 10 seconds; duplicates are skipped by hash.
- On Android and iOS, scans on open import new files from a picked folder (manual test notes in the PR if no device automation).
- Removal option behaves as specified; permission loss is shown and recoverable.
- Unit tests for the scanner logic with a fake adapter (new, changed, renamed, removed, duplicate).

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "watch-folder": the reader picks folders and the app imports books found there automatically (continuously on desktop, on open and on demand on mobile and web).

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: sync-v10 (built: Electron folder bridge pattern in electron/syncFolder.cjs, preload.cjs, src/sync/desktopBridge.ts); blob-store (docs/features/blob-store.md) for content hashes (if missing, hash with crypto.subtle here and leave BookMeta.contentHash for blob-store to adopt); formats-simple for non-EPUB files (if missing, import EPUB only).

Build (read docs/features/watch-folder.md first; rules there are binding):
1. src/watchFolder/ with the platform adapter interface and the shared scan/import logic; local-only tables watchedFolders and folderFiles (schema bump, migration test); BookMeta.contentHash.
2. Adapters: Electron (new book-folders:* IPC, watch with debounce and size-stable check), Android (SAF tree URI plugin), iOS (security-scoped bookmark plugin), web (File System Access API, Chrome/Edge).
3. Settings UI, New badges, toasts, status and errors; removal option with confirmation.
4. Tests with a fake adapter; manual device notes. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/watch-folder.
```

## 10. Future Extensions

- Calibre library awareness (read `metadata.db` for better titles, authors and series).
- Watch a cloud folder through the cloud provider's API on mobile.
- Two-way: export books from the app into the folder.
- Per-folder shelf/collection in the library.
