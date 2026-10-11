# Scan the device for books, with in-app filtering

Roadmap id: `device-scan` · Area: Formats and export · Status: idea · Depends on: `watch-folder` (scanner and platform adapters); PDF results need `formats-pdf`, but the scan can ship for EPUB first

## 1. Purpose

New users often have books scattered across Downloads, WhatsApp/Telegram folders, Documents and old backups, and do not remember where. A one-tap scan that finds every book file on the device, then lets the reader filter and choose what to import, gets a full library in minutes.

## 2. Expected Behaviour

- Library → **Find books on this device** (also offered once in onboarding after setup, and in Settings → Library & data).
- The app scans the allowed locations (see platform rules) for files with importable extensions: `.epub`, `.pdf`, and when supported `.mobi`, `.azw3`, `.txt`, `.md`. It reads **only file names, sizes, dates and paths** during the scan; file contents are read only for files the reader chooses to import (and for EPUB/PDF titles, see below).
- Results open in a **Found on this device** screen:
  - Each row: title (from the file's metadata for EPUB/PDF, read lazily for visible rows; otherwise the file name), format badge, folder, size, date modified, and **In library** if a book with the same content hash is already imported.
  - **Filters:** format (multi-select), folder (multi-select from found folders), size range, date range, "Hide books already in my library" (default on), "Arabic only" (uses EPUB/PDF language metadata or a sample of the title; off by default), and a text search on title/file name.
  - **Sort:** title, folder, size, date.
  - **Select** with checkboxes, **Select all shown**, and **Import selected (N)**.
- Import uses the same importers, duplicate checks and progress as other imports; results summary at the end.
- Optional after import: "Watch these folders for new books?" lists the folders the imported files came from and adds them as watched folders (`watch-folder`) if chosen.
- The results list is kept until the next scan so the reader can come back and import more.

## 3. User Flows

1. Library → Find books → (Android: grant access) → scanning "1,240 files checked, 63 books found" → filter PDF + "Telegram" folder → select 10 → Import.
2. Desktop → Find books → choose drives/folders to scan (defaults: user folders) → results → import all EPUBs.
3. iOS → Find books → explanation that iOS only allows chosen folders → pick "Files › Books" → results.

## 4. UI / UX Behaviour

- Scanning screen with live counts and Cancel; results appear progressively.
- Empty result: "No books found in the places Arabic Reader can look. You can add books with + Add book."
- Rows virtualised for thousands of results.

## 5. Data & State

- Local-only table `deviceScanResults` (path/URI, name, size, mtime, format, title?, language?, folder, contentHash?, inLibrary) replaced on each scan. Not synced.
- Uses `BookMeta.contentHash` (from `watch-folder`/`blob-store`) for "In library".

## 6. Technical Requirements

Platform rules (state them in the UI exactly as they apply):
- **Desktop (Electron):** scan the user's home folders by default (Documents, Downloads, Desktop, and Telegram/WhatsApp desktop download folders when they exist); "Choose locations" adds drives or folders. Skip system folders, `node_modules`, `.git`, app bundles, hidden folders. Limit depth to 12. Use the `book-folders:*` IPC bridge from `watch-folder`, extended with a recursive search.
- **Android:** on Android 11 and later an app cannot list other apps' documents (EPUB, PDF) through MediaStore. It only sees files it created itself, unless it holds **All files access** (`MANAGE_EXTERNAL_STORAGE`). That permission finds everything, but Google Play allows it only after a policy declaration and review. So:
  - The **Play build** scans folders the reader picks through the Storage Access Framework. The app suggests likely ones (Download, Documents, Telegram, WhatsApp/Media/WhatsApp Documents), and the reader grants each with one tap in the system picker.
  - **Sideloaded or F-Droid builds**, behind a build flag, may request All files access and scan shared storage fully.
  - Record this decision in an ADR before shipping.
- **iOS:** no device-wide scan is possible; scan only folders the reader picks (same as watched folders), recursively.
- **Web:** File System Access directory picking (Chrome/Edge desktop), scanning the chosen folder; elsewhere not available.
- Content hashing only for selected files at import (hashing every found file is too slow), except files under 5 MB, which can be hashed during the scan for "In library".
- Metadata: EPUB title/language from the OPF (read the zip's central directory and OPF only), PDF from the document info dictionary via pdf.js (`formats-pdf`).

## 7. Edge Cases & Error Handling

- Permission denied: explain and offer folder picking instead.
- Same file in several places: one row per path, "Same book in 3 places" note; importing one marks the others In library.
- Unreadable metadata: use the file name.
- Scan cancelled: results so far are kept.
- Huge drives: progress shows folders checked; Cancel works within a second.

## 8. Acceptance Criteria

- Desktop scan finds EPUBs and PDFs in default folders, filters work, multi-select import works, duplicates are marked.
- Android build flavour behaviour matches the decision recorded in the ADR; the Play build passes policy (no all-files permission unless approved).
- iOS uses picked folders only and says so.
- Unit tests for filter/sort logic and the skip rules; scanner tested with a fake adapter.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "device-scan": find book files on the device, show them in a filterable list, and import the reader's selection.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: watch-folder (docs/features/watch-folder.md) provides src/watchFolder platform adapters and hashing; formats-pdf for PDF titles and import. Check what exists; ship EPUB first if PDF import is missing.

Build (read docs/features/device-scan.md first; platform rules are binding):
1. Write an ADR (docs/adr/) on Android scope: Storage Access Framework folder picks (with suggested folders) for the Play build, all-files access only behind a build flag for other builds. Stop for the user's approval if the ADR changes store policy exposure.
2. Recursive search on each platform adapter with skip rules and depth limit; local-only deviceScanResults table (schema bump, migration test).
3. Found-on-this-device screen with lazy metadata, filters, sort, multi-select import, "Watch these folders?" follow-up.
4. Entry points: Library, onboarding (once), Settings.
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/device-scan.
```

## 10. Future Extensions

- Scan connected e-readers (Kindle/Kobo over USB) and offer their books plus highlights (`kindle-import`).
- Scan cloud drives (Google Drive, OneDrive) with explicit sign-in (privacy gate, ADR).
- Duplicate cleanup across the device ("these 3 copies are the same book").
