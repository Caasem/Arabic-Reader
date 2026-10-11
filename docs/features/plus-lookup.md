# "+" on a single-entry lookup

Roadmap id: `plus-lookup` · Area: Reader experience · Status: planned · Depends on: nothing

## 1. Purpose

In the dictionary popup each entry has a round "+" that saves just that entry as its own vocabulary card. The "+" is drawn only when the lookup returns **more than one** entry (`DictionaryPopup.tsx`: `onSaveEntry && result!.entries.length > 1`). When a word has a single entry the reader sees only the large *Save Vocabulary* button. That makes the popup inconsistent (the "+" the reader has learned to use is missing) and, since the crowd work, it also loses a signal: a "+" save records the chosen entry in `sensePicks` (`recordEntrySave`), while *Save Vocabulary* deliberately does not.

This feature shows the per-entry "+" on single-entry lookups too, so saving one entry always works the same way.

## 2. Expected Behaviour

- When a lookup returns exactly one entry, that entry shows the same round "+" button, in the same place and style, as entries do when there are several (both the classic and the clean popup layouts).
- Pressing it saves that one entry as a card exactly as the multi-entry "+" does: `savePopupEntry(entry)` → the card's `selectedEntryIndex` points at that entry, the word is coloured as saved in the book, and `recordEntrySave` stores the pick.
- After saving, the "+" shows its saved state (the same filled/check state the multi-entry "+" shows), and *Save Vocabulary* shows "saved" because the word is now in the vocabulary.
- Pressing *Save Vocabulary* afterwards keeps its existing toggle meaning: it removes every card for the word (and forgets the picks). No change.
- Pressing the "+" when the word is already saved from that entry does nothing (no second card). This matches the multi-entry case.
- A lookup with zero entries shows no "+" (unchanged).
- The "+" also appears on the single entry in the Alt+D dictionary search results if that view shows per-entry "+" for multiple entries; if it does not, leave it unchanged.

## 3. User Flows

1. Reader taps a word whose lookup returns one entry → popup shows the entry with a "+" → reader presses "+" → card saved, "+" turns to saved, word coloured in the text.
2. Reader taps a word with one entry → presses *Save Vocabulary* instead → behaves as today (one card with all entries, which is that one entry; no pick recorded).
3. Reader saved with "+", reopens the word later → "+" shows saved; *Save Vocabulary* shows saved; pressing *Save Vocabulary* un-saves everything.

## 4. UI / UX Behaviour

- Same component, class names and position as the existing per-entry save button (`dict-popup__entry-save`); no new icon.
- Keyboard: the button is focusable and activates on Enter/Space like the existing one.
- Tooltip/aria-label: reuse the existing label text for the per-entry "+".
- Clean layout (`prefs.dictionaryPopupCleanLayout`): "+" sits in the round-button column as for multiple entries. If the single entry is Al-Wasit and its section heading also has a "+" (`onSaveEntries`), keep both; they save the same content, which is acceptable and matches the multi-entry layout where the heading "+" saves all entries.
- No loading state is needed beyond what the existing "+" has.

## 5. Data & State

- No new data. Uses `vocabularyService.saveToVocabulary` through `saveLookup`, and `recordEntrySave` in `src/sensePicks`.
- Saved state per entry: reuse `savedEntryKeys` in `DictionaryPopup` (the set used to show a "+" as saved).

## 6. Technical Requirements

- Change the condition that builds `saveButton` in `src/components/reader/DictionaryPopup.tsx` so it is drawn when `onSaveEntry` is provided and there is at least one entry. Check every other place the same `entries.length > 1` rule is used for per-entry saving (search for `length > 1` in that file and in `src/popupClean`) and decide case by case; do not change grouping or folding rules that use the same comparison for other reasons.
- All three readers use this popup, so one change covers them; verify in each.
- No preference. This is a consistency fix, not an optional feature.

## 7. Edge Cases & Error Handling

- Lookup still loading: no "+" until entries exist (unchanged).
- A provider failed (`failedProviders`) and only one entry came back from another provider: "+" shows for that entry.
- Russian (Baranov) single entries and personal-dictionary single entries: "+" shows; selection-save (`onSaveSelection`) keeps working beside it.
- Save fails (IndexedDB error): the existing save path's error handling applies; the "+" must not switch to saved if the promise rejects.

## 8. Acceptance Criteria

- A word with exactly one dictionary entry shows a per-entry "+" in the classic and clean layouts, in all three readers.
- Pressing it creates one `VocabularyItem` with `selectedEntryIndex` set and records one `sensePicks` row.
- Pressing it twice creates no second card.
- Multi-entry behaviour is unchanged (existing e2e specs pass).
- New e2e test: open a word with one entry, press "+", assert one card in Vocabulary and the "+" in its saved state.
- Version bumped, CHANGELOG entry written.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "plus-lookup": show the per-entry "+" save button in the dictionary popup when a lookup returns a single entry.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists:
- src/components/reader/DictionaryPopup.tsx draws a per-entry round "+" (class dict-popup__entry-save) only when `onSaveEntry && result!.entries.length > 1`. Pressing it calls onSaveEntry(entry) → useWordLookups.savePopupEntry, which saves that entry as its own card and calls recordEntrySave (src/sensePicks) to record the reader's pick.
- The big "Save Vocabulary" button (onSave → togglePopupSave) saves all entries on one card, or removes every card for the word if it is already saved. It does not record a pick.

What to change:
1. Read docs/features/plus-lookup.md (this spec) in full.
2. In DictionaryPopup.tsx, draw the per-entry "+" whenever onSaveEntry is provided and the entry exists, including when there is exactly one entry. Search the file and src/popupClean for other `entries.length > 1` checks tied to per-entry saving and apply the same rule; leave checks used for grouping, folding or the split layout alone.
3. Make sure the "+" shows its saved state after saving, and that a second press does not create a second card.
4. Verify in the new reader, the epub reader and the clean reader, in both classic and clean popup layouts.
5. Tests: add an e2e spec that finds a word with a single entry in the sample book (search the existing e2e specs for how they open the sample book and tap words), presses "+", and checks one card exists in the Vocabulary screen and one sensePicks row exists. Run npm run test:unit, npm test and npm run build.
6. Bump the version, add a CHANGELOG entry ("The + to save one entry now also appears when a word has only one entry"), set plus-lookup to "done" in docs/roadmap/roadmap.json, commit on a branch feat/plus-lookup.

Acceptance: see section 8 of the spec. Do not change Save Vocabulary's toggle behaviour.
```

## 10. Future Extensions

- A per-sense "+" inside long entries (save one numbered sense without selecting text).
- Long-press "+" to open the edit modal pre-filled with that entry.
- Show which entry a saved card came from as a small mark on the entry when the popup reopens (beyond the "+" state).
