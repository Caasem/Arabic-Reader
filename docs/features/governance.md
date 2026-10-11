# Governance and documentation

Roadmap id: `governance` · Area: Foundation · Status: done (2026-10-06) · Depends on: nothing · Enables: `infra-cloud`, `data-arch-spec`

## 1. Purpose

The project has grown to many features, several platforms, long-lived branches and work split across separate development sessions. Knowledge kept only in chat is lost between sessions, branches drift (nine were unmerged on 2026-10-06), and decisions get re-argued. Governance is the minimum process that stops this: where each kind of knowledge lives, how work moves from idea to release, and what must be true before something ships.

## 2. Expected Behaviour

What "done" looks like for this item:
- `docs/README.md` maps every kind of document to its home: README (users), CHANGELOG (releases), `docs/governance.md` (process), `docs/roadmap/roadmap.json` + the roadmap site (order, status, dependencies), `docs/specs/` (design of larger features), `docs/features/` (one standalone spec + development prompt per roadmap item), `docs/adr/` (decisions).
- `docs/governance.md` defines the lifecycle (idea → spec → ADR → branch → ship), single sources of truth, the four gates (privacy, data, licence, test), branch and release rules, review, and the session routine.
- The roadmap site (`npm run roadmap`, http://localhost:4177) shows the dependency graph, critical path, filters, details per item, and links each item to its feature spec.
- Every roadmap item has a feature spec in `docs/features/<id>.md` (this set of documents), except items deliberately parked (listed in `docs/features/README.md`).
- ADRs 0001-0003 accepted or rejected by the maintainer; ADR 0004 (poetry web local backend) lives with the poetry work.
- **Milestones** are added to the roadmap (M1 Consolidate, M2 Core reader v1.0, M3 Expansion) and the site computes the critical path to a chosen milestone instead of to the longest chain overall.
- **Branch hygiene:** branches fully contained elsewhere are deleted; every open branch appears in a roadmap item's `branch` field.
- **CI:** `.github/workflows/test.yml` already runs install, typecheck, lint, unit tests and the e2e suite. It does not yet typecheck the crowd server (`npm run crowd:typecheck`); add that step.

## 3. User Flows

(Maintainer flows.)
1. Start of a session: open the roadmap site, pick the next item on the M-milestone's critical path, open its feature spec, copy its development prompt into the new session.
2. End of a session: update the item's status and notes in `roadmap.json`; write an ADR if a decision was made.
3. Monthly: prune ideas, re-estimate, check branches.

## 4. UI / UX Behaviour

Roadmap site: item detail panel shows a "Spec" link to `docs/features/<id>.md` and the design doc link; milestone selector at the top; critical path recomputed for the selected milestone.

## 5. Data & State

`roadmap.json` items gain `milestone?: 'M1' | 'M2' | 'M3'` and `brief: 'features/<id>.md'`. Milestones listed at the top level with a title and goal.

## 6. Technical Requirements

- The roadmap site is static (`docs/roadmap/index.html`) served by `scripts/roadmap-serve.mjs` (port 4177, serves `docs/`).
- Keep the site dependency-free.

## 7. Edge Cases & Error Handling

- Two sessions editing `roadmap.json` at once (it happened with the poetry session): the file is small; resolve by hand on merge. Prefer committing roadmap changes on the feature branch that caused them.
- An item whose spec disagrees with the code: the code is the truth; update the spec in the same PR.

## 8. Acceptance Criteria

- Docs map, governance doc, templates, ADRs, roadmap with milestones and spec links, feature specs, all committed on `main`.
- Site shows milestones and spec links.
- CI runs on PRs to `main`.
- Duplicate branches deleted after the maintainer approves.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Finish roadmap item "governance": milestones and spec links on the roadmap site, CI on main, and branch hygiene.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists: docs/README.md, docs/governance.md, docs/adr/0000-0003, docs/specs/_template.md, docs/roadmap/roadmap.json + docs/roadmap/index.html + scripts/roadmap-serve.mjs (npm run roadmap), docs/features/*.md (one spec per roadmap item).

Do (read docs/features/governance.md first):
1. Add milestones to roadmap.json (M1 Consolidate: sync-v10 remaining items, governance, CI, iOS on-device check of sanitised scripting; M2 Core reader v1.0: plus-lookup, click-space-save, dict-fullpage, anki-e2e, sentence-mining, formats-simple, blob-store, storage-ux; M3 Expansion: the rest). Ask the maintainer to confirm the assignment before committing it.
2. Site: milestone selector, critical path per milestone, "Spec" link per item (brief field).
3. CI: .github/workflows/test.yml already runs typecheck, lint, unit and e2e tests; add a crowd-server typecheck step (npm run crowd:typecheck) and confirm it triggers on push and PR to main.
4. List branches fully contained in others (git cherry) and ask before deleting any.
5. Commit on a branch docs/governance-<topic>.
```

## 10. Future Extensions

- Generate `CHANGELOG.md` sections from commit trailers.
- A "decisions needed" view on the roadmap site (open questions from all specs).
- Contributor guide for outside contributors once the plug-in API exists.
