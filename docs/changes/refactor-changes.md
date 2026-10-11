# Refactor pass: change matrix

The plan from 2026-10-10: tidy the repo, put the readers on one shared core, keep only the new reader and PDF pages
(decided 2026-10-11), and replace hand-wired feature switches with a registry. One phase per branch and worktree, one PR each, green CI before merge.
Order: **0 → 2a → 1 → 2b → 5**. Phases 3 (dictionaries as packs), 4 (popup split) and 7 (colour tokens) are planned separately.

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

## Phase 1: shared reader core (done)

Branch `refactor/phase1-reader-core`, worktree `Arabic-Reader-p1`. Nothing users can see; no version bump. Every move
is its own commit with only import paths changed, so `git log --follow` keeps each file's history.
`src/readerCore/README.md` lists what is there and the rules.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Clean-text modules moved to `src/readerCore` | 2b deletes `src/cleanReader`, and the new reader imported six modules from it | `chapterHtml`, `cleanPosition`, `cleanFocus`, `elementAsDocument`, `parseCleanEpub` (and its test), `useCleanSavedWords` in `src/cleanReader` | The same files in `src/readerCore`. `cleanReader/` holds only `CleanReader.tsx` and `cleanReader.css` | None. localStorage keys unchanged (`arabic-reader:cleanFocus`, `arabic-reader:cleanPosition:<book>`) | Files go back to `src/cleanReader` |
| `ReaderSwitch` moved to `src/readerCore` | It chooses between the kept readers, so it belongs with the core | `src/cleanReader/ReaderSwitch.tsx`, with `NewReaderNotice` (and its CSS), which only it mounts | `src/readerCore/ReaderSwitch.tsx`, `NewReaderNotice.tsx`, `newReaderNotice.css`. `_context.md` and the feature prompts in `docs/features/` point to the new path | None | Files and doc paths go back |
| Text model, search, locations and painting moved from `src/quietReader` | PDF pages reached into the new reader's folder for them | `location`, `paint`, `searchState` in `src/quietReader`, and `bookModel`, `cleanSearch`, `rootSearch` that `searchState` is built on | All six in `src/readerCore`, which never imports from `src/quietReader`. Their tests moved to `readerCore/helpers.test.ts` unchanged | None | Files and tests go back to `src/quietReader` |
| Chapter markup styles split from `cleanReader.css` | The new reader imported the old reader's whole stylesheet for three rules | `.clean-reader__title`, `__gap`, `__break` in `cleanReader.css`, imported by both readers | Those three in `readerCore/chapterHtml.css`, imported by both. The rest stays in `cleanReader.css`, imported only by `CleanReader` | None: same rules, same order in the new reader | One stylesheet again |

Decisions:

| Question | Choice | Why |
|---|---|---|
| `src/reader/tokenizer`, `wordInteraction`, `session`: move or re-export? | **Neither**: they stay in `src/reader/` | Used well beyond the two readers (dictionaries, speed reader, vocabulary, book search), and 2b doesn't delete them. A re-export would add a second import path to the same code |
| `quietReader/progress`, `textOffsets` | **Stay** in `src/quietReader` | PDF pages count whole pages and map words through the text layer (`pdfText.ts`); neither uses them or should |
| New reader chrome PDF pages borrows (`Chrome`, `BookDrawer`, `MarginLevels`, `DisplaySheet`, `icons`, `TimerPopover`, `pomodoroClock`, `useMarks`) | **Stays** in `src/quietReader` | It is the new reader's UI, `src/quietReader` stays, and moving it would churn many files for nothing 2b needs |
| Legacy names (`clean:` locations, `parseCleanEpub`, `.clean-reader__*`, `cleanFocus`) | **Kept** | Renaming changes stored data or every caller, with no change in behaviour |

## Phase 2b: remove Original layout and the old clean reader (done)

Branch `refactor/phase2b-retire-readers`, worktree `Arabic-Reader-p2b`. Users can see it: 0.96.0. Session 1 (Sonnet)
ported the 25 specs that started in Original layout, one commit each; session 2 (Opus) removed the readers. Four
reading paths become two: the new reader and a PDF's own pages.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Specs run in the new reader | The readers they ran in are gone | 25 specs started in Original layout through `e2e/originalReader.ts`; `arabic-fold` and `dictionary-page` seeded "new reader off"; `new-reader-migration` tested Switch back | Every spec runs in the new reader; `originalReader.ts` is gone; `old-reader-prefs.spec.ts` checks that preferences from either old reader still open books in the new reader | Five tests are `fixme`, one for each accepted loss below (`docs/changes/reader-gaps.md`) | Specs go back to the old readers |
| Original-layout positions land on their word | The brief: bookmarks made there must land at the right spot, not only the right chapter | A bookmark, last place or link holding an epub CFI opened its chapter at the top | `readerCore/epubPosition.ts` walks the CFI in the chapter's XHTML, counts the letters before it and finds the same count in the clean text. Unit tests in `epubPosition.test.ts` | Old bookmarks and books last read in Original layout open on their word | Back to the chapter's start |
| Original layout and the old clean reader deleted | Only the new reader and PDF pages stay | `components/reader/Reader.tsx` and what only it used (useEpubReader, EpubService, its top bar, footer, panels, search overlay, selection toolbar, quick settings, footnote popup, vocab levels, pomodoro timer, word styles), `src/cleanReader`, Display -> View | Gone (35 files, about 4,200 lines). The toasts the new reader and PDF pages borrowed from `Reader.css` moved to `quietReader.css` | Books show as clean text only: no book styling, images or table layout. Per-book "original" views stored in localStorage are no longer read | Restores both readers and Display -> View |
| Reader settings removed | Nothing to choose | Settings had *New reader*, *Read books as clean text* and the 0.95.0 notice with *Switch back*; preferences `quietReaderEnabled`, `cleanReaderEnabled`, `newReaderSwitchBack` | Settings -> Reading keeps the dock choice. Migration 1 is a no-op (its slot keeps the count). Book search no longer checks the reader | Stored preferences may still carry the three keys; nothing reads them | Restores the switches and the notice; preferences already saved without the keys get defaults (new reader on) |
| Footnotes leave out script source | Found while porting: a note holding a `<script>` showed its source as text | `noteText` used `textContent` | Notes skip the tags chapters skip (script, style, media). Unit test in `parseCleanEpub.test.ts` | Cleaner notes | Script source shows in such notes again |
| Bundle budgets lowered | They sat 10% above the old sizes | Entry script 730 kB, entry styles 165 kB, app code 2.85 MB | 685 kB, 148 kB, 2.75 MB (measured 622 kB, 134 kB, 2.50 MB). epub.js stays, so the drop is modest | A PR growing them past the new budgets fails CI | Old budgets |

Accepted losses (each is a `fixme` test that still documents it):

| Loss | Where it showed | Why accepted |
|---|---|---|
| The book's own styling, images and table layout | Original layout | The decision of 2026-10-11 ("Which readers stay") |
| Bold and italic inside footnotes | `footnotes.spec.ts` | Notes are plain text; the words are all there |
| *Go to note* for a note link that leads nowhere | `footnotes.spec.ts` | The new reader says the note can't be found; the button would have nothing to open |
| Text labels under the page-turn arrows | `reading-layout.spec.ts` | The arrows are named (aria-label and tooltip) |
| A `script-src 'none'` CSP per section | `untrusted-epub.spec.ts` | No section iframe exists; book markup never reaches the page (the ported test checks that) |
| Collapsing the Vocab Levels panel to a strip | `vocab-levels.spec.ts` | The margin's Levels panel opens and closes; the dock reopens it |

## Phase 5: feature registry (done)

Branch `refactor/phase5-feature-registry`, worktree `Arabic-Reader-p5`. Nothing users can see; no version bump. Opus
designed the registry and converted `noteCard` and `annotate`; Sonnet converted the other 13 features, one commit
each, following `docs/changes/feature-registry-howto.md`. `src/features/registry.test.ts` pins the order of hosts, app
hosts and settings sections and was not edited by any conversion commit.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Registry and loops (`src/features/registry.ts`, `placement.ts`) | Adding a feature meant editing 4 to 6 shared files, and nothing listed what a feature touched | `ReaderSwitch`, `App` and `SettingsPanel` each had a hand-written list of feature hosts, app hosts and settings sections | One ordered `FEATURES` list of descriptors (`id`, `pref`, `Host`, `AppHost`, `SettingsSection`, `settingsGroup`, `settingsAfter`, `chords`, `touchPoints`). The three places loop over it. `registry.test.ts` checks the orders, that every `pref` exists and that no two features share a chord | Same hosts, same order. Two side effects: `AutoSync` (core, renders nothing) now mounts after the crowd-sync host instead of before it; the entry chunk grows 11 kB (622 to 633 kB, budget 685 kB) because settings of settings-only features now load with it | Restores the hand-written lists (revert the merge commit) |
| `noteCard` and `annotate` converted | The worked examples for the howto | Inline entries in the registry | `noteCardFeature` and `annotateFeature` exported from their `index.ts`, one line each in the registry | None | Features go back to inline entries |
| Dictionary features converted: `dictionarySearch` (Alt+D), `bookSearch` (Alt+S), `bookVocab` (Alt+V), `flashCard` (Alt+F) | Same | Inline entries with `touchPoints: []` | `<id>Feature` in each `index.ts` with `pref`, `chords` and `touchPoints` filled in; one registry line each | None. Alt+D is bound by `useSearchHotkey`, not `useChordHotkey`, and is listed anyway so the duplicate-chord test sees it | Inline entries again |
| `picksExport` (Alt+P) and `studyDesk` (Alt+I, C, M, U, X, Shift+X) converted | Same | Inline entries | `picksExportFeature` (no preference) and `studyDeskFeature` (`studyDeskEnabled`) | None | Inline entries again |
| Popup features converted: `verbForms`, `popupClean`, `wasitMatch`, `wasitStructure` | Same | Inline entries | One descriptor each. Prefs: `verbFormsEnabled`, `dictionaryPopupCleanLayout`, `wasitMatchHighlight`, `wasitStructureEnabled` (the on/off switches, not all named `<feature>Enabled`). Their exports used by `DictionaryPopup` stay. Each stylesheet import stays ahead of the component imports so CSS loads in the old order | None | Inline entries again |
| App-wide features converted: `look`, `readerFont`, `crowdSync` | Same | Inline entries | `lookFeature` (`lookEnabled`), `readerFontFeature` (no `<feature>Enabled` preference, so none), `crowdSyncFeature` (`crowdSharing`). Other exports stay | None | Inline entries again |
| Feature `localStorage` calls moved behind `src/utils/storage.ts` | Eleven feature files wrote to `localStorage` directly, each with its own try/catch | Direct `getItem` / `setItem` calls | `readString`, `writeString`, `readJSON`, `writeJSON`. A test per key family (`// @vitest-environment jsdom`) writes a value the old way and reads it back, checks writes land under the same key and format, and checks the fallbacks | None. **Every key string and stored format is unchanged**, so saved values read back | The calls go back inline |

Storage moves, all with unchanged keys:

| Key family | Keys | Now in | Test |
|---|---|---|---|
| Sheet tab memory (JSON map) | `arabic-reader:sketch-tabs` | `annotate/sheets.ts` | `annotate/sheetTabs.test.ts` |
| Note card colour (plain string) | `noteCard.color` | `noteCard/color.ts` | `noteCard/color.test.ts` |
| Floating shell position (JSON `{x, y}`) | `dictionarySearch.floatingPos`, `studyDesk.inboxPos`, `studyDesk.pullPos` | `dictionarySearch/shellPos.ts` | `dictionarySearch/shellPos.test.ts` |
| Study desk memory (plain strings) | `studyDesk.docPanelMin` ('1'/'0'), `studyDesk.lastMargins`, `studyDesk.pullTarget`, `studyDesk.pdfSnap` ('on'/'off'), `studyDesk.current.<bookId>` | `studyDesk/deskMemory.ts` | `studyDesk/deskMemory.test.ts` |
| Anki pending deletes (JSON array) | `anki.pendingDeletes` | `anki/deletions.ts` | `anki/deletions.test.ts` |
| Added catalogue books (JSON map) | `browseLibrary.added` | `browseLibrary/added.ts` | `browseLibrary/added.test.ts` |
| Dictionary page last tab (plain string) | `dictionaryPage.lastTab` | `dictionaryPage/lastTab.ts` | `dictionaryPage/lastTab.test.ts` |
| Floating card position (JSON `{x, y}`) | `noteCard.floatingPos`, `flashCard.floatingPos` | `floatingCard/position.ts` | `floatingCard/position.test.ts` |

Left alone (core code, not features): `CollapsibleSection`, `diagnosticsLog`, `pdf/ocr/index.ts`, `pomodoroService`,
`PreferencesProvider`.

## Phase 4: dictionary popup split (done)

Branch `refactor/phase4-popup-split`, worktree `Arabic-Reader-p4`. Nothing users can see; no version bump. Same DOM, class names, props, event handling and effect order. `DictionaryPopup.tsx` stays the entry point (every import is unchanged); `DictionaryPopup.css` is untouched.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Small components moved to `components/reader/dictionaryPopup/` | One 1,301-line file held five components, a helper and the popup | `MorphValue`, `SentenceInBook`, `Alternative`, `OcrNote`, `EditableWord` defined in `DictionaryPopup.tsx` | One file each, moved as they were (only `export` added) | None | Move them back |
| `groupEntriesByProvider` in `entryGroups.ts` | A pure helper deserves a test | Private function and `EntryGroup` type in the popup | Exported with its type; `entryGroups.test.ts` pins how it folds consecutive entries and keeps flat indices | None | Move back, drop the test |
| Token selection in `useTokenSelection.ts` | The click and drag selection logic is its own concern | State, reset effect, `toggleToken`, `addTokenRange`, `clearEntrySelection`, the pointer handlers and the window `pointerup` effect inline | A hook taking `word` and the two token maps. Its effects sit in the same position relative to the popup's other effects (nothing between them before) | None | Inline the hook again |
| Entry list rendering in `entryList.tsx` | About 320 lines of JSX inside the popup | `renderSubEntries` and `renderGroupList` closed over about 30 values | Plain functions (not components, so the element tree is the same) taking one `EntryListContext` object that the popup builds each render | Two new `only-export-components` lint warnings in `entryList.tsx` | Inline the functions again |

Left inline: the positioning code (`recalcPosition` and its layout effect), the add-dictionary panel state, the split-column wheel handling and the footer. Each depends on the popup's own refs, props and render order, so moving them risked more than it saved. `DictionaryPopup.tsx` is 678 lines (from 1,301), above the 500-line target.

## Phase 6: routing (done)

Branch `refactor/phase6-routing`, version 0.97.0. Users can see this.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| Hash routes (`src/routing`: `parseRoute`, `formatRoute`, `useHashRoute`) | The address never changed, so Back and Forward did nothing useful and a reload always landed on the Library | The screen lived only in `App` state | `#/library` (also no hash), `#/read/<bookId>`, `#/read/<bookId>/levels`, `#/vocabulary`, `#/highlights`, `#/review`, `#/dashboard`, `#/speedReader`, `#/dictionary?q=<word>`. Unknown or garbled hashes are the Library. Hash only, so it works from file:// and Capacitor | Back and Forward move between screens; a reload stays on the screen | Revert the merge commit, or delete `src/routing` and the two routing effects in `App.tsx` |
| `App` wiring | Keep the existing state and handlers | `view`, `activeBook`, `vocabPanelOpen`, `dictRequest` set by `handleNav`, `openBook`, `backToLibrary` and the dictionary listener | A change of address is applied to that state (loading a `#/read/<id>` book through `libraryService`); a change of state is written to the address (a new history entry). A book that no longer exists replaces the hash with `#/library`. First-run onboarding is untouched | The dictionary's Back button adds a history entry like any other navigation. Each Vocab Levels toggle and each dictionary lookup also adds one. A reading position and Settings are not in the address; `#/dictionary?q=` carries the word only, not its book or tab | As above |

Not done: Android's hardware back button. Nothing in `src` or `android` listens for Capacitor's `backButton`, so it
still behaves as before (the WebView history now has entries to go back through).

## Phase 7: colour tokens (done)

Branch `refactor/phase7-colour-tokens`, worktree `Arabic-Reader-p7`. Nothing users can see; no version bump. Every token's value is the literal it replaced, so the rendered colours are the same in every theme.

| Change | Why | Before | After | Impact | Revert |
|---|---|---|---|---|---|
| `src/theme/palette.css` (111 `--c-*` tokens), imported first in `src/index.css` | Hard-coded colours were scattered through 26 component CSS files | `#rgb`, `#rrggbb`, `rgb()` and `rgba()` written inline | Named by role and place (`--c-popup-warn`, `--c-settings-backdrop`), grouped by area, defined once on `:root`. Not per theme, so they never change with the theme | None | Revert the six phase 7 commits |
| Component CSS uses `var(--c-...)` | One place to read and change them | 126 inline literals | 126 `var(--c-...)` uses, nothing else on the line changed. Same literal for the same purpose shares a token; the same value for a different purpose has its own | None | As above |

Left alone: colours in `.ts` / `.tsx`; the theme blocks in `index.css`, `quietReader.css`, `readerTools.css`, `annotate.css`, `onboarding.css`, `BrowseLibraryPanel.css` and the palettes in `src/look/`; literals already inside a `var(--x, #fallback)` fallback; the per-theme `::highlight(qr-hl-yellow)` colours and the theme swatches in `quietReader.css`; the `conic-gradient` colour wheel in `pdfHighlighterSettings.css`.

## Planned phases

Only phase 3 (dictionaries as packs) remains, and it is not planned for now.
