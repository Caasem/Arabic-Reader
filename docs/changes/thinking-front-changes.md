# Thinking desk: change matrix

Every change made for the thinking desk ([spec](../features/thinking-front.md)), one row per phase. Each phase is one
commit. To remove a phase, revert its commit (`git revert <sha>`); later phases build on earlier ones, so revert from the
bottom up. To switch the whole feature off without code changes, turn off Settings → Reading → Thinking desk
(`thinkingFrontEnabled`, off by default); each part also has its own switch there.

New code lives in `src/thinking/` (the feature: hosts, screens, pure logic) and, for data, in `src/studyDesk/`. Edits to
existing files are listed per phase and kept to the lines named. Everything in `src/thinking/` loads on demand, so the
entry bundle only gains the feature descriptor and the small extension points.

| Phase | Version | What it adds | New files | Existing files touched | Switch | Revert notes |
|---|---|---|---|---|---|---|
| Spec | — | This file, the spec, the roadmap item | `docs/features/thinking-front.md`, this file | `docs/roadmap/roadmap.json` (one item) | — | Docs only. |
| 0. Data and extension points | (no UI) | DeskItem gains `move`, `tie`, `links`, `threads` (+ `joined` dates), `versions`, `review`, `answer`, `answeredAt`, `droppedAt`; Desk kind `thread` with `question` and `titleAr`; desk database version 2 (items indexed by `*threads`, new tables `links` and `journal`); store functions for threads, links and the journal; an "item added" listener; the ten `thinking*` preferences; two registry extension points (props for App hosts, a panel above the Library) | `src/studyDesk/thinkingStore.test.ts` (migration from version 1, threads, links, journal) | `src/studyDesk/types.ts` (fields and types), `db.ts` (version 2), `deskStore.ts` (`onItemAdded`, desk order with threads, thread members leave a deleted thread, `createThread`, `updateDesk`, `joinThread`, `leaveThread`, links, journal, `readAll` for four tables); `src/storage/registry.ts` (two tables); `src/dataExport/stores.ts` (four desk tables); `src/types/preferences.ts`, `src/state/defaultPreferences.ts` (ten prefs); `src/features/registry.ts` (`AppHostProps`, `LibraryTop`); `src/App.tsx` (passes `onOpenBook` to App hosts, one line); `src/components/library/Library.tsx` (renders features' `LibraryTop`, two lines) | — | Revert: the database stays at version 2 in browsers that opened it (Dexie keeps it; version 1 code cannot open it, so revert this only with a version bump or by deleting `arabic-reader-desk`). New fields on items are ignored by the study desk. |
