# BlobStore: content-addressed file storage

Roadmap id: `blob-store` · Area: Foundation · Status: planned · Depends on: `data-arch-spec`, `sync-v10` · Enables: `pack-manager`, `storage-ux`, `watch-folder`, `formats-pdf` originals, `audiobooks`, `video`

> **Design authority:** `docs/specs/data-architecture.md` (sections 5-6 and 12) fixes the interfaces and build order for this item. Where this spec and that design differ, the design wins.

## 1. Purpose

Large files are stored ad hoc today: book files as Blobs in the Dexie table `bookFiles` (keyed by book id), uploaded fonts in their own IndexedDB database, dictionary data in provider-specific stores, some data bundled as JS chunks. There is no de-duplication (the same EPUB imported twice is stored twice), no way to measure usage per class, and every new feature (PDF originals, audio, video, packs) would need its own store. BlobStore is one byte store for class B (user files) and class C (packs), addressed by content hash.

## 2. Expected Behaviour

For the reader, nothing changes visibly except:
- Importing the same file twice stores it once (the library still follows its duplicate rules for records).
- Storage usage is measurable (used by `storage-ux`).
- On desktop, large files live as files on disk (faster, no IndexedDB size issues).

For developers:
- `put(bytes, { class, owner, mime }) → hash`, `get(hash) → Blob | undefined`, `has(hash)`, `delete(hash, owner)` (deletes the bytes only when no owner references remain), `list()`, `usage()`, `url(hash)` (an object URL or file URL for media playback, revoked by the caller).
- Ownership: each blob records owners (`{ kind: 'book' | 'pack' | 'font' | 'audio' | 'original', id }`); references are counted.
- Integrity: `get` verifies the hash of small blobs (< 5 MB) on read in development builds; `verify(hash)` available for all.
- Migration: on first start of the version that ships BlobStore, existing `bookFiles` rows move into it (hash computed, `BookMeta.contentHash` set, row replaced by a reference). The migration is resumable and does not block reading (books not yet migrated are read from the old table).

## 3. User Flows

1. Update the app → library loads as before; in the background, book files migrate ("Optimising storage…" in Settings → Storage while it runs).
2. Import a book already present → stored once; library shows the duplicate behaviour already defined.

## 4. UI / UX Behaviour

Only a status line in Settings → Library & data during migration, and errors there if migration fails for a file ("1 book could not be moved; it still works").

## 5. Data & State

- **Web/Capacitor backend:** IndexedDB database `arabic-reader-blobs` (separate from the main DB so the main DB stays small and backup-friendly) with stores `blobs` (hash → Blob) and `refs` (hash → { class, owners[], bytes, mime, createdAt }). Optionally OPFS for blobs when the data-arch probe shows it is better on a platform.
- **Electron backend:** files under `<userData>/blobs/<first2>/<hash>` plus the same `refs` metadata in IndexedDB; access via a `blobs:*` IPC bridge.
- **Capacitor native option:** Filesystem plugin under the app's data directory if the probe shows IndexedDB limits on iOS.
- `BookMeta.contentHash` (synced): lets two devices recognise the same book file.
- Hash: SHA-256, hex, of the bytes.

## 6. Technical Requirements

- Interface and backends in `src/blobStore/`; the interface is the one finalised in `docs/specs/data-architecture.md` (data-arch-spec). If that spec changed the names, follow it.
- `booksRepo` (`saveBook`, `getBookFile`, `listBookFileIds`, `saveBookFile`, removal) re-implemented over BlobStore with the same function signatures, so callers do not change.
- Hashing large files: stream in chunks (Web Crypto has no streaming SHA-256; use a small streaming implementation for files > 50 MB, or hash in a worker with chunked `crypto.subtle.digest` over the whole buffer if memory allows).
- Migration runs in the background, batch by batch, recorded in a local `blobMigration` state row.
- Backups and sync are unaffected: book files are not in backups or sync today.

## 7. Edge Cases & Error Handling

- Quota exceeded on put: throw a typed `QuotaError`; callers show "Not enough space".
- Hash collision: treat as impossible (SHA-256) but `put` compares sizes and logs if sizes differ for the same hash.
- Interrupted migration: resumes next launch; reading works throughout.
- A reference without bytes (lost): `get` returns undefined; the book shows "File not on this device" with Add file.

## 8. Acceptance Criteria

- All book reads/writes go through BlobStore on every platform; existing e2e tests pass.
- Migration moves existing books and is resumable (unit test with a fake backend interrupted mid-way).
- De-duplication and reference counting tested.
- Electron stores files on disk; web/mobile in the blobs database.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "blob-store": a content-addressed store for user files and data packs, with web, Electron and mobile backends, and migrate book files into it.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: data-arch-spec (docs/features/data-arch-spec.md, docs/specs/data-architecture.md) fixes the interface. Use its final interface; if it is still a draft, use the one in docs/features/blob-store.md section 2 and note it.

What exists: book files in Dexie table bookFiles via src/persistence/booksRepo.ts (saveBook, getBookFile, listBookFileIds, saveBookFile, remove); uploaded fonts in their own IndexedDB (src/readerFont/userFonts.ts); Electron IPC bridge pattern in electron/syncFolder.cjs + preload.cjs.

Build (read docs/features/blob-store.md first):
1. src/blobStore/ with the interface, IndexedDB backend (separate database), Electron file backend via a blobs:* IPC bridge, reference counting, usage(), list(), url().
2. booksRepo over BlobStore with unchanged signatures; BookMeta.contentHash (synced).
3. Background, resumable migration from bookFiles; status line in Settings.
4. Tests: backend contract tests run against each backend (fake fs for Electron), migration interruption, dedupe, refcount.
5. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/blob-store.
```

## 10. Future Extensions

- Move uploaded fonts and dictionary stores onto BlobStore.
- Optional sync of class B blobs through the sync folder, by hash (only missing hashes copied).
- Garbage collection report in the storage screen.
