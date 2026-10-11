# Refactor pass: change matrix

The plan from 2026-10-10, revised 2026-10-11: tidy the repo, put the readers that stay on one shared core, retire the
others, and replace hand-wired feature switches with a registry. One phase per branch and worktree, one PR each, green CI before merge.
Order: **0 → 2a → 1 → 2b → 5**. Phases 3 (dictionaries as packs), 4 (popup split), 6 (routing) and 7 (colour
tokens) are planned separately.

To undo a phase, revert its merge commit. Each row says what a revert leaves behind.

## Which readers stay (decided 2026-10-11)

| Reader | Where | Decision | Why |
|---|---|---|---|
| New reader | `src/quietReader` | **Stays.** Becomes the only way to read a reflowable book, on every device | The default since 0.21.0. Everything new since then (dock, Ḥāshiya, ink, Focus, piles) was built for it |
| PDF pages | `src/pdf/pages` | **Stays** | The only view for a PDF whose text can't be reflowed |
| Speed reader | `src/speedReader` | **Stays** | Its own tab, not a book reader |
| Original layout (epub.js `Reader`) | `src/components/reader/Reader.tsx` | **Removed in 2b** | A second full reader to keep in step. The new reader already resolves highlights made there by their text |
| Old clean reader | `src/cleanReader/CleanReader.tsx` | **Removed in 2b** | The new reader replaced it in 0.21.0. Until now phones and tablets were still onboarded into it |

The `epubjs` package **stays**. It isn't only a renderer: import (`libraryService`), book search (`bookSearch/engine`, `reader/epub/bookSearch`), the speed reader (`speedReader/tokenStream`), the vocabulary index (`vocabRarity/bookVocabIndex`, `VocabLevels`) and footnotes (`reader/footnotes`) use it to read EPUB files.

## Phase 0: housekeeping (done)

Branch `refactor/phase0-cleanup`, worktree `Arabic-Reader-refactor`. Nothing users can see; no version bump.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Full Baranov file moved into `baranov-data/` | The build read a dictionary from the repo root, while the folder that documents it held an incomplete copy (7,000 of 39,000 lines) that nothing used | `russian.txt` at the root (read by the build); `baranov-data/russian.txt` incomplete and unused | One file, `baranov-data/russian.txt`, complete and read by the build. `vite.config.ts`, `SOURCE-README.md`, `CONTRIBUTING.md`, `NOTICE.md` point to it | None for users: the built Baranov chunk is byte-identical (same hash, `CIsFGcvB`). One less file at the root | Restores both files and the old path |
| Piles prototype moved out of `src/` | A design file, not app code, sat among the study desk sources; piles shipped in 0.70.0 | `src/studyDesk/piles.prototype.html` | `docs/prototypes/piles.prototype.html`; `docs/features/study-desk.md` updated | None. Not imported by the app | Moves it back |
| Change matrices grouped in `docs/changes/` | Five `*-changes.md` files crowded the `docs/` root next to governance and privacy docs | `docs/annotate-changes.md`, `shared-dock-`, `shared-focus-`, `sketch-margin-`, `study-desk-changes.md` | `docs/changes/<name>-changes.md` (this file joins them). Links in three `index.ts` headers, the study desk spec and `roadmap.json` updated | None for users. Old links in closed PRs point to the previous paths | Moves them back |
| Bundle size check in CI | Nothing stopped the app's own code from growing. Data and workers already total about 38 MB | No size check | `scripts/check-bundle-size.mjs` (`npm run size`) runs after the e2e tests. Per-file budgets, plus a 2.85 MB budget for app code (now 2.57 MB) | A PR that makes a file more than about 10% bigger fails CI until it shrinks or the budget is raised in the same commit, with a reason | Removes the script, the npm script and the CI step |

## Planned phases

| Phase | Branch / worktree | Model | Change | Why | Before | After | Impact |
|---|---|---|---|---|---|---|---|
| 2a. New reader on touch devices | `refactor/phase2a-touch-new-reader`, `Arabic-Reader-p2a` | Opus | Phone and Tablet onboarding pick the new reader. A one-time, versioned preferences migration (`prefsMigrations`) turns the new reader on for anyone who had it off, with a notice offering Switch back until 2b. Touch spec ported to the new reader. Old iOS highlight fallback. No reader deleted | Phase 1 then only has to serve the readers that stay | Phones and tablets start in the old clean reader. **New reader** off opens the old clean reader or the epub.js reader. No way to migrate stored preferences | Every device reads in the new reader. The old readers are reachable only by Switch back or Settings, both labelled legacy | Users who had the new reader off are moved once and told. **Needs a check on a real phone** |
| 1. Shared reader core | `refactor/phase1-reader-core`, `Arabic-Reader-p1` | Opus | New `src/readerCore/`: book model, positions, word wrapping, search, painting, sessions. `ReaderSwitch` moves there | The default reader imports six modules from `cleanReader/` and its popup and hooks from `components/reader/`. Deleting any reader breaks the others | Shared code lives inside whichever reader came first | One core used by the new reader and PDF pages | No visible change. Every reader e2e spec has to pass unchanged. Highest regression risk of the pass |
| 2b. Remove Original layout and the old clean reader | `refactor/phase2b-retire-readers`, `Arabic-Reader-p2b` | Sonnet to port the e2e specs, then Opus to remove the readers | Port the 26 specs that start in Original layout. Delete the epub.js `Reader`, `CleanReader.tsx`, Display → View → Original layout, `quietReaderEnabled`, `cleanReaderEnabled` and 2a's Switch back | Both duplicate the new reader (see "Which readers stay") | Four reader paths | Two: the new reader and PDF pages (plus the speed reader tab) | Saved positions, highlights and bookmarks carry over. **`epubjs` stays** for import, search, the speed reader, the vocabulary index and footnotes |
| 5. Feature registry | `refactor/phase5-feature-registry`, `Arabic-Reader-p5` | Opus for the design and the first two features, then Sonnet for the rest | Each feature declares `{id, pref, SettingsSection, Host, chords, touchPoints}`. `ReaderSwitch` and `SettingsPanel` loop over the list. Feature code stops calling `localStorage` directly | 23 `*Enabled` flags, overlays and settings groups are wired by hand. 12 files call `localStorage` directly instead of `src/utils/storage.ts` | Adding a feature touches 4 to 6 shared files | One folder plus one registry line. Storage goes through `src/utils/storage.ts` or the preferences repo | No visible change. Values already stored in `localStorage` must be read and migrated, not lost |
