# Dexie Cloud sync option

Roadmap id: `dexie-cloud` · Area: Foundation · Status: planned (decision needed first) · Depends on: `sync-v10`

## 1. Purpose

Folder sync needs a cloud folder the reader already uses and works only where the app can reach a folder: desktop now, then Android, iOS later, and never in a plain browser. Some readers want "sign in and it syncs" across browser, phone and desktop. `docs/specs/storage-and-sync.md` section 6 plans Dexie Cloud (the hosted sync service for Dexie, the IndexedDB library the app already uses) as a second, independent sync path.

**Principle settled, details still need an ADR.** ADR 0002 (revised and accepted 2026-10-06) allows a third-party sync service to hold the reader's records, only when the reader picks it, off by default, with the provider named and data deletable. The item stays in M1 (maintainer, 2026-10-06). Before code, a Dexie Cloud ADR must record the provider's terms, pricing, data region, sign-in method and client licence.

## 2. Expected Behaviour

If approved:
- Settings → Sync offers two methods: **Sync folder** (existing) and **Sync with an account (Dexie Cloud)**. Only one can be active at a time; switching asks for confirmation and explains that the other stops.
- Account sign-in: email → one-time code → signed in. The settings show the email, last sync, devices, **Sign out**, **Delete my cloud data** (removes all records from the service and signs out).
- Synced: exactly the tables in `SYNCED_TABLES` (vocabulary, highlights, bookmarks, positions, preferences, books metadata, sessions). Not synced: book files, dictionaries, local-only tables, crowd data.
- Works in the browser/PWA, Electron, Android and iOS.
- Merge: Dexie Cloud's own model (per-property last-writer-wins). There is no conflict list for this path (spec section 6). The reading-position rule "furthest wins" is not available here; positions use last write. This difference is stated in the settings help.
- Privacy text: what is stored (records listed above), where (Dexie Cloud's servers, region), who can see it (the provider), how to delete. Off by default.

## 3. User Flows

1. Phone browser: Settings → Sync → Sync with an account → email → code → signed in → vocabulary appears from the laptop.
2. Switching from folder to account: confirm → folder sync stops; account sync uploads local records.
3. Delete my cloud data → confirm → data removed from the service; local data stays.

## 4. UI / UX Behaviour

Same status dot and Sync activity entry point as folder sync; Sync activity shows only what this path can report (last sync, errors).

## 5. Data & State

- `dexie-cloud-addon` configuration on the existing database; realm per user. Dexie Cloud adds its own internal tables.
- The write layer still stamps `updatedAt` and writes the outbox; with Dexie Cloud active, the folder engine is off and the outbox is not published (it may be cleared).
- Preference `syncMethod: 'none' | 'folder' | 'dexie-cloud'`.

## 6. Technical Requirements

- Verify Dexie Cloud's current pricing, data region, terms and the client add-on licence before starting; record them in the ADR.
- Make sure the add-on does not conflict with the write layer's transaction scopes (`syncScope`) and the v10+ schema; prototype first on a copy.
- Electron and Capacitor: confirm the add-on works in their WebViews (service worker and storage differences).
- Keep everything behind `syncMethod`; with `none` or `folder` the add-on must not load (bundle split).

## 7. Edge Cases & Error Handling

- Offline: changes queue in Dexie Cloud's own mechanism; status shows "Waiting for connection".
- Account deleted elsewhere: sign out locally, keep data.
- Free-tier limits reached: show the service's error; do not lose local data.
- Switching methods with unsynced folder changes: publish them first or warn.

## 8. Acceptance Criteria

- ADR accepted before code.
- Two devices (browser and Android) sync all synced tables through an account.
- Only one method active; switching is safe.
- Delete my cloud data works.
- e2e with Dexie Cloud's test environment or a mocked add-on, plus a manual two-device check.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Roadmap item "dexie-cloud": an account-based sync option using Dexie Cloud, as an alternative to folder sync.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

FIRST: this needs a decision. Write ADR docs/adr/NNNN-dexie-cloud-sync.md covering: user records on a third-party server, account (email code), privacy wording, Dexie Cloud pricing, region, terms and add-on licence (look them up and cite), and alternatives (folder sync only; our own sync server). Present it to the maintainer and stop until they accept it.

Then (read docs/features/dexie-cloud.md and docs/specs/storage-and-sync.md section 6):
1. Prototype the add-on on a copy of the schema; confirm it works with the write layer (src/persistence/writeLayer.ts, syncScope) and in Electron and Capacitor WebViews.
2. syncMethod preference; Settings → Sync with the two methods, sign-in, devices, sign out, delete cloud data; only one method active.
3. Load the add-on only when selected.
4. Tests and a manual two-device check. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/dexie-cloud.
```

## 10. Future Extensions

- Share a book's notes with another account (Dexie Cloud realms).
- Use the same account for the web extension.
- Our own sync server implementing `SyncTransport` if Dexie Cloud proves unsuitable.
