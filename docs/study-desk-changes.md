# Study desk: change matrix

Every change made for the study desk ([spec](features/study-desk.md)), one row per phase. Each phase is one commit on `feat/study-desk`. To remove a phase, revert its commit (`git revert <sha>`); later phases depend on earlier ones, so revert from the bottom up. To switch the whole feature off without code changes, turn off Settings → Reading → Study desk (`studyDeskEnabled`).

New code lives in `src/studyDesk/` only. Edits to existing files are listed per phase and kept to the lines named.

| Phase | Version | What it adds | New files | Existing files touched | Switch | Revert notes |
|---|---|---|---|---|---|---|
| 1. Data | (no UI) | Desk database, items and desks, document HTML cleaning, store, export | `src/studyDesk/types.ts`, `db.ts`, `docHtml.ts`, `deskStore.ts` and tests; `docs/features/study-desk.md`, this file | `src/storage/registry.ts` (DESK_DB, two tables, blob namespace `desk`); `src/dataExport/stores.ts` (desk tables in export and import); `src/types/preferences.ts` and `src/state/defaultPreferences.ts` (four `studyDesk*` preferences); `docs/roadmap/roadmap.json` (one item) | — | Revert removes the tables from the registry; an existing `arabic-reader-desk` database stays in the browser untouched (delete it from the browser's site data if wanted). |
