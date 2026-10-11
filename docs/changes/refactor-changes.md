# Refactor pass: change matrix

The plan from 2026-10-10: tidy the repo, put the readers on one shared core, keep only the new reader and PDF pages
(decided 2026-10-11), and replace hand-wired feature switches with a registry. One phase per branch and worktree, one PR each, green CI before merge.
Order: **0 → 2a → 1 → 2b → 5**. Phases 3 (dictionaries as packs), 4 (popup split), 6 (routing) and 7 (colour
tokens) are planned separately.

To undo a phase, revert its merge commit. Each row says what a revert leaves behind.

## Phase 0: housekeeping (done)

Branch `refactor/phase0-cleanup`, worktree `Arabic-Reader-refactor`. Nothing users can see; no version bump.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Full Baranov file moved into `baranov-data/` | The build read a dictionary from the repo root, while the folder that documents it held an incomplete copy (7,000 of 39,000 lines) that nothing used | `russian.txt` at the root (read by the build); `baranov-data/russian.txt` incomplete and unused | One file, `baranov-data/russian.txt`, complete and read by the build. `vite.config.ts`, `SOURCE-README.md`, `CONTRIBUTING.md`, `NOTICE.md` point to it | None for users: the built Baranov chunk is byte-identical (same hash, `CIsFGcvB`). One less file at the root | Restores both files and the old path |
| Piles prototype moved out of `src/` | A design file, not app code, sat among the study desk sources; piles shipped in 0.70.0 | `src/studyDesk/piles.prototype.html` | `docs/prototypes/piles.prototype.html`; `docs/features/study-desk.md` updated | None. Not imported by the app | Moves it back |
| Change matrices grouped in `docs/changes/` | Five `*-changes.md` files crowded the `docs/` root next to governance and privacy docs | `docs/annotate-changes.md`, `shared-dock-`, `shared-focus-`, `sketch-margin-`, `study-desk-changes.md` | `docs/changes/<name>-changes.md` (this file joins them). Links in three `index.ts` headers, the study desk spec and `roadmap.json` updated | None for users. Old links in closed PRs point to the previous paths | Moves them back |
| Bundle size check in CI | Nothing stopped the app's own code from growing. Data and workers already total about 38 MB | No size check | `scripts/check-bundle-size.mjs` (`npm run size`) runs after the e2e tests. Per-file budgets, plus a 2.85 MB budget for app code (now 2.57 MB) | A PR that makes a file more than about 10% bigger fails CI until it shrinks or the budget is raised in the same commit, with a reason | Removes the script, the npm script and the CI step |

## Which readers stay (decided 2026-10-11)

| Reader | Decision | Why |
|---|---|---|
| New reader (`src/quietReader`) | **Keep**, for every book on every device | Every feature since 0.21.0 lives here (dock, Ḥāshiya, ink, shared Focus). It already honours the layout settings, shows footnotes, and finds Original-layout highlights by their text |
| PDF pages (`src/pdf/pages`) | **Keep** | The only way to read a PDF whose text can't be reflowed |
| Speed reader (`src/components/speedReader`) | **Keep** | A separate tab, not a reading view. Cheap to maintain |
| Original layout (epub.js `Reader`) | **Remove** (phase 2b) | Gets no new features. Loses: the book's own styling, images and table layout. 26 e2e specs run in it today and move to the new reader first |
| Old clean reader (`CleanReader`) | **Remove** (phase 2b) | The phone and tablet onboarding profiles pick it today, yet it has no highlights, bookmarks or search. Phase 2a moves those users to the new reader first |

The `epubjs` package stays for now: import, search, the speed reader, the vocabulary index and footnotes use it to
read EPUB files. Dropping it is an optional later phase.

## Planned phases

| Phase | Branch / worktree | Model | Change | Why | Before | After | Impact |
|---|---|---|---|---|---|---|---|
| 2a. New reader on touch devices | `refactor/phase2a-touch-new-reader`, `Arabic-Reader-p2a` | Opus | Phone and Tablet onboarding profiles pick the new reader. A one-time migration turns it on for everyone who has it off, with a notice | The old clean reader is about to go, and touch users currently get the weakest reader | Phone/Tablet → old clean reader, desktop → new reader | Every device → new reader. Old readers still reachable until 2b | Touch users gain highlights, bookmarks, search, dock, Ḥāshiya. **Needs a check on a real phone.** Highlights need iOS 17.2+ (CSS Custom Highlight API) |
| 1. Shared reader core | `refactor/phase1-reader-core`, `Arabic-Reader-p1` | Opus | New `src/readerCore/` for what the new reader and PDF pages share. `ReaderSwitch` moves there | The new reader imports six modules from `cleanReader/`, a folder that 2b deletes | Shared code lives inside the old clean reader's folder | One core used by the new reader and PDF pages | No visible change. Every reader e2e spec passes unchanged |
| 2b. Remove Original layout and the old clean reader | `refactor/phase2b-retire-readers`, `Arabic-Reader-p2b` | Sonnet ports the 26 specs, then Opus removes the readers | Delete the epub.js `Reader`, `CleanReader`, the `quietReaderEnabled` and `cleanReaderEnabled` settings and Display → View → Original layout | Four reading paths become two | New reader, Original layout, old clean reader, PDF pages | New reader and PDF pages | Books show as clean text only (no book styling or images). Highlights and bookmarks carry over. A minor version bump |
| 5. Feature registry | `refactor/phase5-feature-registry`, `Arabic-Reader-p5` | Opus for the design and the first two features, then Sonnet for the rest | Each feature declares `{id, pref, SettingsSection, Host, chords, touchPoints}`. `ReaderSwitch` and `SettingsPanel` loop over the list. Feature code stops calling `localStorage` directly | 23 `*Enabled` flags, overlays and settings groups are wired by hand. 12 files call `localStorage` directly instead of `src/utils/storage.ts` | Adding a feature touches 4 to 6 shared files | One folder plus one registry line | No visible change. Values already stored in `localStorage` must be read and migrated, not lost |
