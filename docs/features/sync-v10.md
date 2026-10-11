# Storage and sync (schema v10, folder sync)

Roadmap id: `sync-v10` · Area: Foundation · Status: in progress. Version 1 is built and merging to `main` in PR Caasem/Arabic-Reader#13; the remaining work is below. · Depends on: nothing · Enables: `blob-store`, `dexie-cloud`, `watch-folder`, `crowd-ranking`

## 1. Purpose

A reader uses the app on a phone and a laptop and expects vocabulary, highlights, notes, bookmarks, positions and preferences to be the same on both, without an account and without the app's own server. The design (full detail in `docs/specs/storage-and-sync.md`) is a sync engine owned by the app, using a folder the reader already syncs (iCloud Drive, Dropbox, OneDrive, Google Drive, Syncthing) as the transport. Every change is an immutable event, merged deterministically, with overwritten changes undoable.

This spec records the expected behaviour and lists what is still to build.

## 2. Expected Behaviour

**Built (version 1, desktop):**
- Settings → Sync: choose a folder (desktop app), switch sync on, name the device.
- Changes sync automatically: 10 s after a local change, on app open, when coming back online, every 5 min while visible, best-effort on hide/close, and on **Sync now**. Failures back off up to 5 min.
- Merge rules: concurrent edits to the same record → the edit with the largest `(updatedAt, deviceId, eventId)` wins; reading position → furthest point wins. Every overwrite appears in **Sync activity** with **Undo** for 90 days (this device only).
- Concurrent delete vs edit → kept in a conflict list; the reader chooses.
- A book synced without its file shows "File not on this device" and **Add file**.
- Snapshots every 500 events; a new device can start from snapshots.
- Pre-migration verified backup before the v10 upgrade; startup is gated on it.

**Still to build (this item's remaining scope):**
1. **Android folder transport:** Settings → Sync on Android lets the reader pick a folder through the Storage Access Framework (persisted tree URI), implementing `SyncTransport` (`list/read/write/remove`, write must fail if the file exists). Triggers as desktop minus the 5-minute poll; open/foreground/online/local change/Sync now.
2. **Hardening pass** (spec section 5, "Device identity and restore"): binding token (database + a second store: Electron user-data file, Capacitor Preferences, localStorage on web) with identity rotation when they disagree; clone check before publish (own folder containing batches this device did not write → rotate identity, republish outbox); reader fork detection (two events with the same `(deviceId, seq)` but different `eventId`, or "conflicted copy" files → mark forked, dedupe by `eventId`, conservative causal rule, one-time warning in Sync activity).
3. **Restore from synced folder** on a fresh install (offered first when the chosen folder already has other devices' data).
4. **Retire this device** in Sync activity's device list.
5. **Out-of-date warning:** a device offline for more than 90 days is told it is out of date and chooses *merge as new records* or *replace with the synced copy*. Only after this exists may deletion markers expire.
6. **Backup hardening** (spec section 4): request persistent storage with honest wording; optional automatic scheduled export to a chosen location (desktop, Android); verified export (re-read and counted).
7. **iOS folder transport**, after checking what Capacitor file plugins support (security-scoped folders, iCloud files not yet downloaded). Until then iOS keeps manual export/import.

## 3. User Flows

1. Laptop: Settings → Sync → choose Dropbox/ArabicReader → on. Phone (Android): Settings → Sync → pick the same folder → "This folder has data from 'Laptop'. Restore from it?" → Restore → vocabulary appears.
2. Edit the same card's meaning on both while offline → reconnect → one wins → Sync activity shows the overwritten version with Undo.
3. Copy the app's data folder to a new PC and open it → binding token mismatch → new identity, no duplicate seq numbers, nothing lost.

## 4. UI / UX Behaviour

- Status dot in Settings and the Library header (synced, syncing, error, last sync time). A badge only when a decision is needed (conflicts, out-of-date, fork warning).
- Sync activity: overwritten changes with Undo ("Undo available until <date>"), conflicts, devices (name, last seen, Retire).
- No sync UI inside the reader.

## 5. Data & State

Built: `syncMeta`, `syncOutbox`, `recordFrontier`, `activityLog`, `syncConflicts` (schema v10); synced tables in `src/persistence/syncedTables.ts`. Remaining work adds `bindToken` to `syncMeta` and a `forked` set (schema bump with migration test), and stores the companion token outside IndexedDB per platform.

## 6. Technical Requirements

- Engine: `src/sync/engine.ts`, `merge.ts` (property tests), `folderSync.ts`, `scheduler.ts`, `autoSync.ts`, `transport.ts`. Electron bridge: `electron/syncFolder.cjs`, `preload.cjs` (`sync-folder:*`), `src/sync/desktopBridge.ts`.
- Android transport: a Capacitor plugin (Kotlin) for SAF tree URIs: choose (ACTION_OPEN_DOCUMENT_TREE + takePersistableUriPermission), list recursively, read, create-new-only write, delete. Keep file names and layout identical to desktop.
- Every remaining item needs tests at the engine level with `memoryTransport` (identity rotation, clone detection, fork handling, out-of-date choice), keeping the existing property tests passing.

## 7. Edge Cases & Error Handling

All listed in `docs/specs/storage-and-sync.md` sections 5-7. In particular: partially synced cloud files are ignored until complete; a folder that disappears pauses sync with an error state; nothing is ever overwritten in the folder.

## 8. Acceptance Criteria

- Android and desktop sync the same folder both ways with all synced tables.
- Identity rotation, clone detection and fork detection have engine tests and behave as specified.
- Restore from folder, Retire device and the out-of-date choice work end to end.
- Persistent-storage request and verified scheduled export work on desktop and Android.
- `docs/specs/storage-and-sync.md` updated where the build differs.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Finish roadmap item "sync-v10" (folder sync). Version 1 is built for desktop; complete the remaining scope listed in docs/features/sync-v10.md section 2 ("Still to build"), one sub-item per branch/PR in the listed order unless the user asks otherwise.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Read first, completely: docs/specs/storage-and-sync.md (the design, binding), docs/features/sync-v10.md (this spec), then src/sync/* and src/persistence/{syncedTables,writeLayer,schema}.ts.

Rules:
- Folder files are immutable: never overwrite or append; create-new-only writes.
- Every behaviour change gets engine tests using memoryTransport; existing property tests in src/sync/merge.test.ts must keep passing.
- The Android transport must produce exactly the same folder layout as desktop.
- Do not expire deletion markers until the out-of-date warning exists.

For each sub-item: implement, test (npm run test:unit, npm test, npm run build), update docs/specs/storage-and-sync.md where reality differs, bump the version, CHANGELOG entry, update docs/roadmap/roadmap.json notes, branch feat/sync-<subitem>.
```

## 10. Future Extensions

- Optional end-to-end encryption of folder files with a passphrase (format already allows it).
- Chromium-only web folder sync via the File System Access API.
- Sync of book files themselves through the folder (class B, opt-in, see `blob-store`).
- Sharing a subset (one book's notes) with another reader through a shared folder.
