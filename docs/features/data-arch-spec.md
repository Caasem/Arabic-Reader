# Data architecture spec and ADRs

Roadmap id: `data-arch-spec` · Area: Foundation · Status: in progress (draft written) · Depends on: `governance` · Enables: `infra-cloud`, `blob-store`, `pack-manager`

## 1. Purpose

Planned work adds PDFs, audio, video, hosted books, crowd data and plug-ins. Without one model of where data lives, each feature would invent its own storage, download logic and privacy rules. `docs/specs/data-architecture.md` (draft) defines four data classes and the layers between them; ADR 0003 records the decision. This item finishes that design so the build items can start.

## 2. Expected Behaviour

There is no end-user feature. The outcome is an agreed design:
- **Four classes:** A user records (Dexie, write layer, synced), B user files (content-addressed blob store, never on our servers by default), C reference packs (versioned, signed, downloaded and cached), D aggregate data (crowd votes and rankings, never merged into A).
- **Interfaces named:** `BlobStore`, `PackManager`, `SyncTransport` (exists), `CrowdClient` (exists as `src/crowdSync`).
- **Table registry:** every Dexie table declares its class, synced or not, and merge rule, in one place (`syncedTables.ts` grows into this).
- **Open questions answered** (spec section 8): OPFS vs IndexedDB for web blobs on iOS Safari (needs a device test), whether class B ever syncs through us (proposed: no), iOS quota policy, self-hosting of packs.
- ADR 0002 (narrow backend exception) and ADR 0003 (four data classes) accepted by the maintainer, or revised.

## 3. User Flows

Maintainer: read the spec → run the iOS storage test page → decide open questions → accept ADRs → roadmap items `blob-store` and `pack-manager` move to planned with interfaces fixed.

## 4. UI / UX Behaviour

None, except a throwaway **storage test page** (not shipped) that measures OPFS and IndexedDB write/read speed, quota and persistence on a real iPhone and Android phone.

## 5. Data & State

Defines it for others. Updates `docs/specs/data-architecture.md` with exact TypeScript interfaces for BlobStore and PackManager.

## 6. Technical Requirements

- Interfaces as TypeScript in the spec (copy-paste ready), including error types.
- The table registry shape: `{ table, class: 'A'|'B'|'C'|'D'|'cache', synced: boolean, merge?: 'lww'|'furthest'|'custom' }`.
- The test page: a standalone HTML in `scripts/storage-probe/` (not part of the app build).

## 7. Edge Cases & Error Handling

Capture in the spec: quota exceeded, eviction on iOS, private browsing (storage unavailable), storage permission denied.

## 8. Acceptance Criteria

- Spec status "agreed" with the date; interfaces final; open questions resolved with evidence (probe results recorded).
- ADRs 0002 and 0003 have status accepted (or superseded by revised ADRs).
- `blob-store` and `pack-manager` feature specs updated to the final interfaces if they changed.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Finish roadmap item "data-arch-spec": turn docs/specs/data-architecture.md from draft into an agreed design with final interfaces, answered open questions and accepted ADRs.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Read: docs/specs/data-architecture.md, docs/adr/0002-local-first-backend-exception.md, docs/adr/0003-four-data-classes.md, docs/specs/storage-and-sync.md, src/persistence/schema.ts, src/persistence/syncedTables.ts, src/crowdSync/index.ts.

Do:
1. Write final TypeScript interfaces for BlobStore and PackManager and the table registry shape into the spec.
2. Build scripts/storage-probe/index.html: measures IndexedDB and OPFS blob write/read, navigator.storage.estimate and persist on the device; ask the maintainer to open it on an iPhone and an Android phone and report results; record them in the spec.
3. Propose answers to each open question; ask the maintainer to decide; record decisions (ADR for anything costly to reverse).
4. Ask the maintainer to accept ADR 0002 and 0003; update their status lines.
5. Update docs/features/blob-store.md and pack-manager.md if interfaces changed. Commit on docs/data-architecture.
```

## 10. Future Extensions

- A class E for plug-in private storage (reserved in the spec).
- Encryption at rest for class A on shared devices.
