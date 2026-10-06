# Full-page dictionary with dictionary switching

Roadmap id: `dict-fullpage` · Area: Reader experience · Status: planned · Depends on: nothing (enables `root-explorer`)

## 1. Purpose

The popup is built for a quick glance beside the text. Some lookups need room: Al-Wasit and Lisan-style articles run for paragraphs, a root has many derived words, and a learner sometimes wants to read a dictionary the way they would read a printed one, browsing neighbouring headwords. Today the reader can (a) look up a tapped word in the popup, and (b) press Alt+D inside a book to search the dictionary in a small floating, palette, drawer or sheet layout (`src/dictionarySearch`). There is no way to give a lookup the whole screen, read one dictionary at a time, or open the dictionary without a book.

This feature adds a **full-page dictionary**: a screen that shows one word's entries with room to read, lets the reader switch between dictionaries like tabs on a shelf of books, search freely, and browse neighbouring headwords. It opens from the popup ("maximise"), from Alt+D, and from the main navigation.

## 2. Expected Behaviour

**Opening**
- The popup gets a **maximise** button in its header (icon: four outward arrows; label "Open in full page"). Pressing it opens the full-page dictionary on the same word, with the same entries, scrolled to the dictionary section the reader was looking at. The popup closes.
- Keyboard: with the popup open, **F** maximises (no modifiers, not in an input; the popup already uses **D** for add-dictionary).
- Alt+D search gets a "Full page" button in its header that opens the full page with the current query.
- The main navigation gets a **Dictionary** item (between Vocabulary and Highlights) that opens the full page with an empty search box. This is the only way in without a book.

**Layout**
- Top bar: back button ("Back to book" when opened from a reader, otherwise "Back"), a search field holding the current word, and the dictionary tabs.
- **Dictionary tabs:** one tab per enabled dictionary that returned at least one entry for the word, in the reader's dictionary order (`providerOrder`), plus an **All** tab first. A tab shows the dictionary's short name and its entry count ("Al-Wasīṭ 3"). Tabs for enabled dictionaries with no result are shown greyed with count 0 and can still be selected (they show "No entry for this word in <dictionary>"). A **+ Add dictionary** tab at the end opens the existing add-dictionary panel (`src/popupAddDictionary`).
- **All** shows every entry grouped by dictionary, like the popup but full width.
- A single-dictionary tab shows only that dictionary's entries, full width, with the dictionary's own structure (Al-Wasit structure, verb forms, examples) exactly as the popup draws it. Reuse the popup's entry rendering; do not write a second renderer.
- **Neighbours (browse) column**, single-dictionary tabs only, for dictionaries that can list headwords in order: a narrow column listing the 10 headwords before and after the current one, alphabetical as that dictionary orders them (by root for root-ordered dictionaries: Al-Wasit, Al-Sihah, Maqayis, root articles). Clicking one looks it up in that dictionary. "Earlier" and "Later" buttons page by 20. On narrow screens the column becomes a "Nearby words" disclosure under the entries. If a dictionary cannot list headwords, the column is not shown.
- Saving works as in the popup: per-entry "+", *Save Vocabulary* for the whole word, selection-save inside entries. Saving from the full page without a book open saves the card with `bookId: 'dictionary'` and `bookTitle: 'Dictionary'`, and no sentence.
- **Search:** typing in the field and pressing Enter looks the text up (same `dictionaryManager.lookup` as Alt+D, including Russian reverse search for Baranov when the query is Cyrillic). Results replace the page. Browser back/forward (and Alt+Left/Right) step through the history of words viewed in this session.
- The last selected tab is remembered (per device, localStorage) and reselected when the word has entries there.

**Closing**
- Esc or Back returns to where the reader came from: the same book position (the reader stays mounted underneath or reopens at the saved position), or the previous screen.

## 3. User Flows

1. Reading → tap word → popup → maximise → full page on "All" scrolled to Al-Wasīṭ → choose the Al-Wasīṭ tab → read → click a neighbouring headword → read it → Back → book at the same place.
2. Library → Dictionary in the nav → type "كتب" → Enter → choose Lane/Baranov/… tab → "+" on an entry → card saved under "Dictionary".
3. Reading → Alt+D → type a word → "Full page" → continue as in flow 1.
4. Full page → "+ Add dictionary" tab → choose Maqāyīs → tab appears with its entries.

## 4. UI / UX Behaviour

- Full page uses the app's main content area (like Vocabulary or Review), not a modal. On phones it is a full-screen view with the tabs in a horizontally scrolling row.
- Loading: tabs show a spinner in place of the count; the body shows the existing popup loading skeleton.
- Errors: a dictionary that failed (`failedProviders`) shows its tab with a warning dot and the body text "Could not load <dictionary>. It may not be downloaded yet." with a link to its setting.
- Empty search: "Type a word, or tap one while reading."
- RTL: entries and neighbours are right-to-left; chrome follows the app.
- Fonts and the reader's popup size setting (`sizePct`) do not apply; the full page uses the reading font and a comfortable fixed size, with the app's zoom.

## 5. Data & State

- No new tables. Uses `dictionaryManager` (`src/dictionary`), `rankByPicks` for ordering when `savedEntriesFirst` is on, and the existing save paths.
- **New provider capability (optional per provider):** `listHeadwords?(around: string, before: number, after: number): Promise<{ headword: string; key: string }[]>` on `DictionaryProvider` (`src/types/dictionary.ts`). Implement it for the bundled providers whose data is an ordered list (Al-Wasit, Al-Sihah, Maqayis, root articles, personal dictionaries, Baranov). AraMorph (a morphological analyser) does not implement it.
- Preference: `dictionaryFullPageEnabled` (default true) to hide the maximise button, the nav item and the F key.
- Session history: in memory (array of words + tab), not persisted.
- localStorage key `dictionaryFullPage.lastTab`.

## 6. Technical Requirements

- New folder `src/dictionaryPage/` with `index.ts` (touch-point comment), `DictionaryPage.tsx`, settings component, CSS.
- Refactor the entry list rendering out of `DictionaryPopup.tsx` into a component both use (for example `DictionaryEntries`), keeping the popup's behaviour byte-for-byte the same; the existing e2e popup specs must pass unchanged. This is the largest part of the work; do it as its own commit first.
- Navigation: add `'dictionary'` to `ViewName` (`src/components/shared/NavBar.tsx`, `src/App.tsx`). Opening from a reader must not lose the reading position; follow how App opens other views from the reader and returns (`openBook`, `setView`).
- Coordinate with `popup-extract` if it has landed: the shared entry renderer should live in whatever module that item created.

## 7. Edge Cases & Error Handling

- Word with no entries in any dictionary: All tab shows "No entry found for '<word>'" and lists the dictionaries searched; neighbours still work in single-dictionary tabs (show the headwords around where the word would be).
- Dictionary disabled while on its tab: switch to All.
- Very long entries: the body scrolls; tabs and search stay fixed.
- Offline and a dictionary not yet downloaded: as in Errors above.
- Opening full page from a book in the epub reader's two-column layout: on return the reader re-renders at the same CFI.

## 8. Acceptance Criteria

- Maximise from the popup opens the full page on the same word and tab group; Back returns to the same reading position in all three readers.
- Tabs list each enabled dictionary with entry counts; switching shows only that dictionary.
- Neighbours appear for Al-Wasīṭ and work by click; paging works.
- Searching and saving work with no book open; such cards appear in Vocabulary under "Dictionary".
- Popup e2e specs unchanged and passing after the renderer refactor.
- New e2e: maximise → switch tab → click neighbour → save → back.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "dict-fullpage": a full-page dictionary that opens from the popup (maximise), from Alt+D, and from a new Dictionary item in the navigation, with one tab per dictionary and a list of neighbouring headwords.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists:
- DictionaryPopup (src/components/reader/DictionaryPopup.tsx) renders a lookup's entries grouped by provider, with per-entry "+", selection-save, Al-Wasit structure (src/wasitStructure), verb forms (src/verbForms), clean layout (src/popupClean) and add-dictionary (src/popupAddDictionary, D key).
- Alt+D dictionary search (src/dictionarySearch) searches from inside a book in four layouts (floating, palette, drawer, sheet); SearchBody saves results.
- dictionaryManager.lookup(word) (src/dictionary) returns DictionaryLookupResult; providers implement DictionaryProvider in src/types/dictionary.ts. Root-ordered providers: alwasit, alsihah, almaqayis, rootArticle; also personal and baranov.
- Views are switched in src/App.tsx (ViewName in src/components/shared/NavBar.tsx).

Plan (read docs/features/dict-fullpage.md first; it is the source of truth for behaviour):
1. Commit 1, refactor only: extract the popup's entry list into a shared component used by DictionaryPopup. No visible change; all existing e2e specs pass.
2. Commit 2: src/dictionaryPage/ with the full page (tabs incl. All and + Add dictionary, counts, search with history, saving with or without a book), the 'dictionary' view and nav item, the popup maximise button and F key, Alt+D's "Full page" button, the dictionaryFullPageEnabled preference and setting.
3. Commit 3: optional DictionaryProvider.listHeadwords(around, before, after) implemented for the ordered providers, and the neighbours column with paging.
4. Tests: unit tests for listHeadwords on each provider (use small fixtures); e2e for flows 1 and 2 of the spec.
5. npm run test:unit, npm test, npm run build. Bump the version, CHANGELOG, set dict-fullpage to "done" in docs/roadmap/roadmap.json, branch feat/dict-fullpage.

Keep the popup's behaviour identical. Cards saved with no book use bookId 'dictionary', bookTitle 'Dictionary'.
```

## 10. Future Extensions

- Root view: everything derived from a root across dictionaries (this is `root-explorer`).
- Side-by-side mode: two dictionaries in two columns for comparison.
- Bookmarks inside dictionaries ("dictionary marks") and a reading position per dictionary, so it can be read like a book.
- Cross-references: words inside a definition become tappable (they already are for saving; make them look-up links).
- Printing or exporting an entry.
