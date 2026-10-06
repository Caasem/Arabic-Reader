# Storage usage screen and full export

Roadmap id: `storage-ux` · Area: Reader experience · Status: planned · Depends on: `blob-store`

> **Design authority:** `docs/specs/data-architecture.md` (sections 5-6 and 12) fixes the interfaces and build order for this item. Where this spec and that design differ, the design wins.

## 1. Purpose

The app keeps everything on the device: books, dictionaries (some are tens of MB), fonts, frequency lists, vocabulary and history. Browsers and phones can run out of space or evict web storage, and readers have no way to see what is using space, free it safely, or take all their data out in open formats. Backup exists (`src/persistence/backup.ts`, Settings "Backup") but covers vocabulary, word instances and highlights only.

## 2. Expected Behaviour

**Storage screen** (Settings → Library & data → **Storage**)
- A bar showing used space by class, and the browser/device quota when available (`navigator.storage.estimate()`): **Your books** (class B), **Your records** (class A: vocabulary, notes, highlights, positions, history), **Dictionaries and data packs** (class C), **Caches** (book location indexes, crowd ranking files, word index caches).
- A list under each class with the largest items first: book title + size; dictionary name + size; and so on.
- Actions:
  - Books: **Remove file only** (keeps the book in the library, its notes and progress; the card shows "File not on this device" and "Add file" as it does for synced books), or **Remove book** (existing removal flow).
  - Dictionaries and packs: **Remove** (frees space; the dictionary shows "Not downloaded" and can be fetched again). Bundled dictionaries that cannot be fetched again are marked "Built in" with no remove.
  - Caches: **Clear caches** (all safe to rebuild).
- **Persistent storage**: a row "Protect from automatic cleanup" calling `navigator.storage.persist()`, showing the result ("Protected" / "The browser declined"). On iOS Safari explain that the home-screen app is less likely to be cleared.

**Full export** (same screen, "Export everything")
- Produces one `.zip`: `records.json` (every class A table, the app's own JSON format with a `formatVersion`), `vocabulary.csv` (one row per card: word, meaning, root, lemma, sentence, book, added, mastery, due), `highlights.md` (per book, highlight text and notes), and `books/` (original book files, optional checkbox "Include book files", default on, shows the size).
- Import of this zip restores records (and books if present), using the same merge rules as sync (never deletes newer local data). This replaces nothing in the existing backup; the old backup stays as "Quick backup (vocabulary and highlights)".

## 3. User Flows

1. Settings → Storage → sees Dictionaries 180 MB → removes Baranov → space freed.
2. Settings → Storage → Books → "Remove file only" on a 40 MB book → book stays with "Add file".
3. Export everything → zip downloaded/saved (desktop: save dialog; mobile: share sheet).
4. New device → Import → choose zip → records and books restored.

## 4. UI / UX Behaviour

- Sizes in KB/MB/GB, one decimal place.
- Calculating sizes may take seconds: show "Measuring…" per section.
- Confirmations for every remove, naming what is lost and what stays.
- Export progress bar; cancel button.

## 5. Data & State

- Reads BlobStore `usage()` and `list()` (from `blob-store`) for classes B and C, Dexie table sizes estimated by counting rows × average serialised size (exact sizes are not available from IndexedDB).
- Export format documented in `docs/specs/export-format.md` (write it as part of this work).
- No new tables.

## 6. Technical Requirements

- **Dependency, `blob-store`:** expects `BlobStore.usage(): Promise<{ bytes: number; byClass: Record<'B'|'C', number> }>` and `list(): Promise<{ hash, bytes, class, owner: { kind: 'book'|'pack'|'font', id } }[]>`. If BlobStore is not built yet, read sizes from the current `bookFiles` table and provider stores, and leave a note.
- Zip with `jszip` (already a dependency for EPUB building).
- Electron: save via the existing desktop bridge or a save dialog; Capacitor: Filesystem + Share plugins.
- Import merges through the write layer so sync sees the changes.

## 7. Edge Cases & Error Handling

- Quota estimate unavailable: hide the quota part of the bar.
- Export larger than available memory (many books): stream books into the zip one at a time; if the zip would exceed 2 GB, offer export without books.
- Import of a zip from a newer app version (higher `formatVersion`): refuse with "This file was made by a newer version of Arabic Reader. Update the app and try again."
- Removing a pack in use by an open reader: removal takes effect after the reader closes; tell the user.

## 8. Acceptance Criteria

- Storage screen shows per-class totals and largest items; numbers within 10% of real usage on a test profile.
- Remove file only keeps the book's records; Add file restores it.
- Export everything produces the four parts; re-importing into an empty profile restores vocabulary, highlights, notes, bookmarks, positions and books.
- Unit tests for the export writer/reader round-trip; e2e for remove-file-only and export/import.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "storage-ux": a storage usage screen with safe cleanup, and a full export/import of all user data in open formats.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: roadmap item blob-store (docs/features/blob-store.md). If BlobStore exists, use usage() and list(); if not, read sizes from the bookFiles table and dictionary stores and note the gap.

What exists: Backup (vocabulary, wordInstances, highlights) in src/persistence/backup.ts and src/components/shared/BackupControls.tsx; Library "File not on this device" + Add file flow (libraryService.attachBookFile, listBookFileIds); jszip is a dependency.

Build (read docs/features/storage-ux.md first):
1. Storage screen in Settings → Library & data, with class totals, largest items, remove actions, clear caches, persistent-storage request.
2. Export everything (zip: records.json, vocabulary.csv, highlights.md, books/) and import with sync-safe merging; document the format in docs/specs/export-format.md.
3. Platform save/share for Electron and Capacitor.
4. Tests: round-trip unit test; e2e for remove-file-only and export → import into a fresh context.
5. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/storage-ux.
```

## 10. Future Extensions

- Automatic cleanup policy ("keep only the last 20 opened books' files on this phone").
- Scheduled export to the sync folder as an extra backup.
- Per-book storage detail (file, location index, word index).
