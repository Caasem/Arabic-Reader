# Alt+N note and Alt+F flashcard

Roadmap id: `alt-note-flash` · Area: Reader experience · Status: done (v0.29.0, in PR Caasem/Arabic-Reader#13) · Depends on: nothing

## 1. Purpose

While reading, a learner wants to jot a note on a passage or write their own flashcard without leaving the page or covering the text with a modal. These two shortcuts open small floating cards that stay out of the way.

This document records the expected behaviour of what is built, so it can be tested, kept stable, and extended.

## 2. Expected Behaviour

This section was checked against the code (`src/noteCard/NoteCard.tsx`, `src/flashCard/FlashCard.tsx`) on 2026-10-06.

**Alt+N, note**
- Alt+N opens a floating card titled "Note" (key hint "Alt N") with a note field that has focus.
- What the note is attached to:
  - Text selected in the book → "Note on the selected text", with the selection quoted.
  - A selection that already has a highlight with a note → "Editing the note on this highlight", with the existing note loaded.
  - No selection → "Note on the first sentence on this page", quoting that sentence.
  - A reader that does not support marks → "Notes aren't available in this reader."
- Selecting different text in the book while the card is open retargets the note. If the reader has not typed yet, the field reloads that highlight's existing note (or empties).
- Five colour dots (yellow, green, blue, purple, red). The chosen colour is remembered per device (localStorage `noteCard.color`).
- Save (button or Ctrl/Cmd+Enter) needs non-empty text. It creates or updates a highlight with the note in the chosen colour. The card then **stays open**: it shows "Saved. Select more text to add another.", clears the field and retargets the current page, so several notes can be taken while reading on.
- A failed save shows a failure message, and the text is kept.
- Esc: if the reader has typed text, the first Esc shows "Press Esc again to discard this note." and the second closes. Otherwise Esc closes at once.

**Alt+F, flashcard**
- Alt+F opens a floating card "Flashcard" (key hint "Alt F"). It has Front, Back, Sentence, Root and Part-of-speech fields.
- How a selection fills the card:
  - A short selection (≤ 40 characters and ≤ 3 words) fills **Front**, and its sentence fills **Sentence**.
  - A longer selection fills **Sentence** only.
  - Selecting again while the card is open fills only the fields the reader has not typed in.
- **Fill meaning** looks Front up in the dictionaries. It fills Back from the AraMorph entry (or the first entry, combining the first two meanings when there are several), and fills Root and POS when they are empty. No result → a "no match" message.
- If a card already exists for Front in this book, the hint "Already a card for this word. Edit it" appears. **Edit it** loads that card, and Save then updates it instead of creating a new one.
- Save (button or Ctrl/Cmd+Enter) needs both Front and Back. A new card goes through `vocabularyService.saveCustomCard`, which sets `custom: true`, empty `entries`, the open book, and the selection's chapter and location. It is scheduled for review like any card, and the word is coloured as saved in the text. The card then stays open with its fields cleared and focus on Front.
- Esc behaves as for notes: a second Esc is needed when typed text would be lost.

**Both**
- The cards share `FloatingCard`. They can be dragged by the header, and their position is remembered per device. They do not block reading: the text behind them can still be scrolled, selected and tapped.
- Each has an on/off setting (`noteCardEnabled`, `flashCardEnabled`).

## 3. User Flows

1. Select a sentence → Alt+N → type → Ctrl+Enter → highlight with note appears; card stays open → select the next sentence → type → save.
2. Select a word → Alt+F → Front filled, Sentence filled → Fill meaning → Save → card in Vocabulary marked as written by hand.
3. Alt+F on a word that already has a card → "Already a card… Edit it" → edit → Save updates it.
4. Drag a card to the margin → keep reading → the card stays.

## 4. UI / UX Behaviour

Shared floating card (`src/floatingCard`), same look as the Alt+D floating search. The status line at the bottom of each card reports Saved, failures, and the Esc-again prompt.

## 5. Data & State

- Notes: `highlights` table (synced). Flashcards: `vocabulary` table (synced) with `custom: true`.
- Position: localStorage per card.
- Preferences: `noteCardEnabled`, `flashCardEnabled`.

## 6. Technical Requirements

- Folders `src/noteCard`, `src/flashCard`, `src/floatingCard`; hosts mounted in `ReaderSwitch`; the reader selection and highlight bridge in `src/readerChords` (`registerReaderMarks`).
- `vocabularyService.saveCustomCard` for flashcards.

## 7. Edge Cases & Error Handling

To check (not verified while writing this spec):
- A selection spanning two chapters in the epub reader: which part the note attaches to.
- The reader being closed while a card has unsaved text: today the card is unmounted without the Esc confirmation. Decide whether that is acceptable.
- Alt+F and Alt+N clashing with OS or Electron menu shortcuts (Alt+F opens a File menu in some Electron builds): confirm the reader prevents the default.

## 8. Acceptance Criteria

All behaviour above holds in the new reader, the epub reader and the clean reader. Existing e2e coverage for the cards passes; add any missing case listed in section 7 as a test.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Roadmap item "alt-note-flash" (Alt+N note and Alt+F flashcard in floating cards) is already built. Your job is to verify it against its spec and close any gaps.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists: src/noteCard, src/flashCard, src/floatingCard, src/readerChords (registerReaderMarks, useChordHotkey), vocabularyService.saveCustomCard, VocabularyItem.custom; hosts <NoteHost> and <FlashHost> in src/cleanReader/ReaderSwitch.tsx.

Do:
1. Read docs/features/alt-note-flash.md. For each behaviour and edge case, find the code and the test that covers it.
2. List gaps (behaviour missing, or untested). Fix real gaps with small commits and add e2e tests for untested cases, in all three readers.
3. Do not redesign the cards. If the code intentionally differs from the spec, update the spec instead and say why.
4. npm run test:unit, npm test, npm run build; if anything user-visible changed, bump the version and add a CHANGELOG entry. Branch feat/alt-note-flash-gaps.
```

## 10. Future Extensions

- A notes panel per book (Alt+Shift+N) listing notes with jump-back.
- Rich text or Arabic keyboard helper in the note field.
- Flashcards with image or audio on the back.
- Turning a note into a flashcard in one press.
