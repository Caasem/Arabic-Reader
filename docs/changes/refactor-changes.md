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

## Phase 2a: new reader on touch devices (done)

Branch `refactor/phase2a-touch-new-reader`, worktree `Arabic-Reader-p2a`. Users can see it: 0.95.0. No reader deleted.
**Needs a check on a real phone** (the APK from CI's "Build Android APK" job, and iOS if available) before merge.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Phone and Tablet profiles pick the new reader | Only the new reader and PDF pages stay; touch devices were still set up for the old clean reader | `profilePreferences` gave phones and tablets `quietReaderEnabled: false, cleanReaderEnabled: true` | Every profile sets `quietReaderEnabled: true, cleanReaderEnabled: false`. Touch settings unchanged (tap opens the dictionary, double tap saves, no hover preview, width 100 / 80) | A fresh Phone or Tablet setup opens books in the new reader. Covered by `deviceProfile.test.ts` and `onboarding.spec.ts` (Phone and Tablet open a starter book) | New phone and tablet setups go back to the old clean reader |
| Preference migrations (`src/state/prefsMigrations.ts`) | No way to change stored preferences once; phase 5 needs one too | Preferences read as stored, gaps filled from defaults | `prefsMigrations` (a count, stored and synced with the preferences, default 0) says how many migrations ran. `PreferencesProvider` runs the missing ones on load, from the mirror or IndexedDB, and saves the result. Unit tests in `prefsMigrations.test.ts` | None by itself. Two new preference fields, `prefsMigrations` and `newReaderSwitchBack` | Migrations stop running. Preferences already migrated keep the new reader and the two fields (unused, harmless) |
| Migration 1: the new reader everywhere | Existing phone and tablet users, and anyone who turned the new reader off, were on readers that 2b removes | `quietReaderEnabled: false` stayed off | Turned on once (`cleanReaderEnabled` off). `newReaderSwitchBack` remembers which old reader they had | Those users open books in the new reader | Not undone by a revert: migrated users stay on the new reader and can turn it off in Settings |
| One-time notice with Switch back (`src/cleanReader/NewReaderNotice.tsx`) | Moving someone's reader without telling them is rude; 2b needs them warned | None | Shown in the new reader while `newReaderSwitchBack` is set. *Keep the new reader* clears it. *Switch back* restores the old reader and clears it. The text says the old readers go in a coming version. `new-reader-migration.spec.ts` | Seen once per migrated user | The notice goes. A pending `newReaderSwitchBack` is left unused |
| Settings mark the old readers *Legacy* | Anyone switching back should know it's temporary | *New reader* off and *Read books as clean text* (Beta) said nothing about removal | *Legacy, will be removed in a coming version.* under each when it is the active choice; the clean reader section is titled (Legacy) | Text only | Labels go back to Beta and nothing |
| Touch spec ported to the new reader | 2b deletes the reader it ran in | `touch-gestures.spec.ts` ran in Original layout with the default bindings | Runs in the new reader at 420×860 with the Phone bindings: tap opens the dictionary, double tap saves, hold, bubble, gestures off | One fewer spec for 2b to port | The spec runs in Original layout again |
| Double tap closes what its first tap opened | With the Phone bindings the first tap opened the dictionary, and the double tap left it over the page after saving | `onDoubleTap` closed only the bubble | Closes the bubble and the popup (`lookups.closeAll`), new reader only | A double tap on a phone saves and leaves the page clear | The popup stays open after a double tap again |
| Old iOS: a note instead of a fallback | The CSS Custom Highlight API needs iOS 17.2+ / Android WebView 105+. Wrapping ranges in `<mark>` would change the text's DOM, which every saved character offset depends on (`paint.ts`) | Highlights silently not drawn | `paintSupported` (exported from `paint.ts`). Where false, the drawer's Marks tab says *Highlights need iOS 17.2 or newer to show on the page. They are saved and listed here.* | Text only, on old devices | The note goes |

## Planned phases

| Phase | Branch / worktree | Model | Change | Why | Before | After | Impact |
|---|---|---|---|---|---|---|---|
| 1. Shared reader core | `refactor/phase1-reader-core`, `Arabic-Reader-p1` | Opus | New `src/readerCore/` for what the new reader and PDF pages share. `ReaderSwitch` moves there | The new reader imports six modules from `cleanReader/`, a folder that 2b deletes | Shared code lives inside the old clean reader's folder | One core used by the new reader and PDF pages | No visible change. Every reader e2e spec passes unchanged |
| 2b. Remove Original layout and the old clean reader | `refactor/phase2b-retire-readers`, `Arabic-Reader-p2b` | Sonnet ports the 25 specs still in Original layout (2a ported touch-gestures), then Opus removes the readers | Delete the epub.js `Reader`, `CleanReader`, the `quietReaderEnabled` and `cleanReaderEnabled` settings and Display → View → Original layout | Four reading paths become two | New reader, Original layout, old clean reader, PDF pages | New reader and PDF pages | Books show as clean text only (no book styling or images). Highlights and bookmarks carry over. A minor version bump |
| 5. Feature registry | `refactor/phase5-feature-registry`, `Arabic-Reader-p5` | Opus for the design and the first two features, then Sonnet for the rest | Each feature declares `{id, pref, SettingsSection, Host, chords, touchPoints}`. `ReaderSwitch` and `SettingsPanel` loop over the list. Feature code stops calling `localStorage` directly | 23 `*Enabled` flags, overlays and settings groups are wired by hand. 12 files call `localStorage` directly instead of `src/utils/storage.ts` | Adding a feature touches 4 to 6 shared files | One folder plus one registry line | No visible change. Values already stored in `localStorage` must be read and migrated, not lost |
