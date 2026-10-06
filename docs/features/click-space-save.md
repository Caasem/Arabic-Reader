# Click, then Space, saves the word

Roadmap id: `click-space-save` · Area: Reader experience · Status: planned · Depends on: nothing

## 1. Purpose

Saving a word today needs a second click on *Save Vocabulary* (or the opt-in Ctrl+Shift+A, which saves the last looked-up word). On a desktop the reader's hand is already on the keyboard. Space after a click should be the fastest way to keep a word: click a word to read its definition, press Space to save it, keep reading.

## 2. Expected Behaviour

- With the dictionary popup open for a word that has at least one entry, pressing **Space** saves the word as *Save Vocabulary* would (every entry on one card), unless the word is already saved.
- Space **never un-saves**. If the word is already saved, Space shows the toast `"<word>" is already in your vocabulary` and does nothing else. (*Save Vocabulary* keeps its toggle; Space is save-only so a double press can't undo a save.)
- After a successful save a toast shows `✓ Saved "<word>"` with an **Undo** button for 4 seconds (reuse the touch quick-save toast and its `undoQuickSave`). The popup stays open and its *Save Vocabulary* button shows the saved state.
- If an entry is focused or selected in the popup (keyboard focus on an entry's "+", or the reader has selected words inside an entry), Space keeps its normal meaning for that control (activating the focused button) and does not trigger the shortcut.
- Space is not captured when focus is in a text input, textarea or contenteditable (the edit modal, the add-dictionary search box, Alt+D search, note cards).
- When no popup is open, Space keeps its current reader meaning (in the new reader's paged mode it turns the page; elsewhere the browser default).
- While the lookup is still loading, Space waits for nothing: it shows `Still looking up "<word>"…` and does not save. (Saving a half-loaded lookup would store no entries.)
- If the lookup returned no entries: toast `No dictionary entry to save for this word`, nothing saved.
- The shortcut has a setting: **Settings → Vocabulary → "Space saves the open word"**, on by default on devices with a physical keyboard. The setting is a preference `spaceSavesWord: boolean` (default `true`).
- Touch-only use is unaffected (there is no Space key).

## 3. User Flows

1. Click word → popup opens with the definition → Space → toast "✓ Saved", word coloured as saved → Esc or click elsewhere closes the popup.
2. Click word → Space → toast → Undo → card removed, word no longer coloured.
3. Click an already-saved word → Space → toast "already in your vocabulary".
4. New reader in paged mode, no popup → Space turns the page as before.
5. Click word → Tab to an entry's "+" → Space → saves that entry (normal button behaviour), shortcut not triggered.

## 4. UI / UX Behaviour

- Toast: the same component and position as the touch quick-save toast (`touchToast` in `useWordLookups`), including the Undo button.
- The popup's *Save Vocabulary* button updates to its saved look immediately (through `markSaved`).
- Settings row text: "Space saves the open word" with help text "With a word's dictionary open, press Space to save it. Space never removes a saved word."
- Discoverability: add "Space — save" to the popup's keyboard hints if the popup shows any (it shows "D" for add-dictionary in places; follow that pattern). If it shows none, add nothing.

## 5. Data & State

- Preference `spaceSavesWord` in `src/types/preferences.ts` and the defaults. Preferences are synced, so the choice follows the reader.
- Saves use the existing `save()` in `useWordLookups` (same card shape as *Save Vocabulary*). Undo uses `vocabularyService.removeFromVocabulary(itemId)`.
- No new tables.

## 6. Technical Requirements

- Key events: the epub reader's section iframes forward keydown to the host through `sectionInteractions.ts` (`handlers.onKeyDown`) and `Reader.tsx`; the new reader listens on window (`QuietReader.tsx`, which uses Space for paging at about line 871); the clean reader has its own handler. Implement the shortcut once, inside `useWordLookups` (beside `handleQuickAddKey`), as `handleSpaceSave(e: KeyboardEvent): boolean` returning `true` when it consumed the key. Each reader calls it first in its keydown handler and skips its own Space handling when it returns `true`.
- Use `e.code === 'Space'` and ignore events with Ctrl/Alt/Meta held or `e.repeat`.
- `preventDefault()` only when consumed, so page scrolling and button activation still work otherwise.
- Ignore when `document.activeElement` (or the iframe's) is an input, textarea, select, contenteditable, or a button inside the popup.
- Keep the shortcut off when `popup` is null (bubble-only states: decide to also support the compact bubble, saving through `saveBubble`, since it is the same intent).

## 7. Edge Cases & Error Handling

- Two quick Spaces: the second sees the word as saved and shows "already in your vocabulary". No duplicate card.
- Popup closed between key down and save resolution: the save still completes; the toast still shows.
- Save throws: toast `Could not save "<word>"`; nothing marked saved.
- A word saved from another device arrives by sync while the popup is open: `saved` may be stale; the save path must check `vocabularyService.isSaved` before writing (or rely on `saveToVocabulary` not duplicating). Do not create a duplicate.
- Speed Reader and other non-reader screens: no effect.

## 8. Acceptance Criteria

- In each of the three readers, with the popup open, Space saves the word once and shows the toast with Undo.
- Space on an already-saved word does not remove it.
- In the new reader's paged mode with no popup, Space still turns the page.
- Space inside the edit modal or a search box types a space.
- Turning the setting off restores the old behaviour.
- Unit test for the decision logic (which events are consumed) and an e2e test for the main flow and Undo.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "click-space-save": with a word's dictionary popup open, pressing Space saves the word.

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
- useWordLookups (src/components/reader/hooks/useWordLookups.ts) owns the popup state and all save paths: save(), togglePopupSave(), quickSave() with a touch toast and undoQuickSave(), and handleQuickAddKey() for the opt-in Ctrl+Shift+A shortcut (saves the last looked-up word). Copy its shape.
- Key handling differs per reader: the epub reader forwards iframe keydown via src/reader/wordInteraction/sectionInteractions.ts and Reader.tsx; the new reader (src/quietReader/QuietReader.tsx) handles window keydown and uses Space to turn pages in paged mode; the clean reader (src/cleanReader/CleanReader.tsx) has its own keydown handler.

What to build (read docs/features/click-space-save.md first; it is the source of truth):
1. Preference spaceSavesWord: boolean (default true) in src/types/preferences.ts and its defaults; a settings row in the Vocabulary group of SettingsPanel ("Space saves the open word").
2. In useWordLookups add handleSpaceSave(e): boolean. It consumes only e.code === 'Space' with no modifiers, not repeating, the preference on, a popup (or bubble) open, and focus not in an input, textarea, select, contenteditable or a popup button. Loading → toast "Still looking up …"; no entries → toast; already saved → toast "already in your vocabulary"; otherwise save every entry like Save Vocabulary, markSaved, and show the touch toast with Undo. Space never un-saves.
3. Call handleSpaceSave first in each reader's keydown path; if it returns true, preventDefault and skip that reader's own Space handling (page turn).
4. Tests: unit-test the event filter; e2e: tap a word, press Space, assert the card exists and the toast shows; press Undo, assert it is gone; in the new reader paged mode with no popup Space turns the page; typing in the edit modal still types spaces.
5. npm run test:unit, npm test, npm run build. Bump the version, CHANGELOG entry, set click-space-save to "done" in docs/roadmap/roadmap.json, commit on feat/click-space-save.
```

## 10. Future Extensions

- Shift+Space saves only the entry that is first (or highlighted) in the popup, recording a pick like the "+".
- A configurable key (some readers will want S or Enter).
- Number keys 1-9 to save the nth entry.
- A "rapid mining" mode: clicking a word and pressing Space also moves the cursor to the next unknown word.
