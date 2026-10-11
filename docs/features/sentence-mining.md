# Sentence mining and cloze cards

Roadmap id: `sentence-mining` · Area: Reader experience · Status: idea · Depends on: nothing (feeds `anki-e2e` and `export-hub`)

## 1. Purpose

A word remembered in its sentence is learned faster and in the right sense. The app already stores the sentence a word was saved from (`VocabularyItem.sentence`, captured by `extractSentence`), and the Review screen shows cards with FSRS scheduling. But review only tests the word on its own, the stored sentence is sometimes cut at the wrong place, and there is no way to save a sentence as the thing to learn.

This feature (a) lets the reader choose and correct the sentence on a card, and (b) adds **cloze review**: the sentence with the word blanked, which the reader must recall.

## 2. Expected Behaviour

**Sentence on cards**
- When saving a word, the card keeps the sentence as today. In the edit modal (`VocabularyEditModal`) the sentence is shown as the book text around the word, with the word highlighted, and two handles (or "◀ more / less ▶" buttons on touch) that extend or shrink the sentence by one clause or one sentence at a time, within the same paragraph. The result is saved to `sentence`.
- A card can also have a translation of its sentence typed by the reader (`sentenceTranslation`, optional, free text).

**Saving a sentence**
- Select a sentence (or any span up to 400 characters) in the reader → the selection toolbar gets **Save sentence**. The reader then taps the word inside the selection that the card is about (the target word is required; the toolbar says "Tap the word to learn in this sentence"). This creates a card whose `surfaceForm` is that word, `sentence` the selection, and entries looked up as usual.

**Cloze review**
- Each card has a **review style**: `word` (current behaviour: front is the word), `cloze` (front is the sentence with the word replaced by "[ … ]"; back reveals the word, its meaning and the full sentence), or `both` (two separate FSRS schedules, one per style).
- Default for new cards: Settings → Vocabulary → "New cards review as": Word (default) / Cloze / Both.
- A card without a sentence can only review as `word`; choosing cloze shows "This card has no sentence".
- In Review, a cloze card shows the hint "Fill the blank" and the root letters as an optional hint ("Show root" button).
- Grading works exactly like existing review (FSRS grades).

## 3. User Flows

1. Tap word → popup → Save → open the card's edit → extend sentence by one clause → save.
2. Select a sentence → Save sentence → tap the target word → card created with that sentence.
3. Review → cloze card "ذهب الولد إلى [ … ] صباحا" → reader recalls → reveal → grade Good.
4. Settings → "New cards review as: Both" → new saves get two schedules.

## 4. UI / UX Behaviour

- Edit modal: sentence area above the meaning, word highlighted, adjust controls, translation field below it.
- Toolbar: "Save sentence" next to existing highlight/note actions; after pressing it, the selected text is outlined and words inside it are tappable; Esc cancels.
- Review: cloze front uses the reading font at the review size; the blank is a fixed-width bracket so the word's length is not revealed.
- Vocabulary list: a small "cloze" tag on cards whose style is cloze or both.

## 5. Data & State

- `VocabularyItem` gains optional fields: `reviewStyle?: 'word' | 'cloze' | 'both'` (absent = 'word'), `sentenceTranslation?: string`, and for `both` a second FSRS state `cloze?: { fsrsDue, fsrsStability, fsrsDifficulty, fsrsScheduledDays, fsrsLearningSteps, fsrsReps, fsrsLapses, fsrsState, fsrsLastReview }`.
- Optional fields need no index; if "due" queries must include cloze due dates, add an index `clozeDue` (top-level number mirrored from `cloze.fsrsDue`) with a schema version bump and migration test.
- Vocabulary is synced; the new fields travel with it (merge rules in `src/sync/merge.ts` treat a row as a unit; confirm).
- Backup format (`BackupData`) includes the new fields automatically; bump nothing unless the import validator rejects unknown fields.
- Preference `newCardReviewStyle`.

## 6. Technical Requirements

- Sentence extension uses the paragraph text available at save time. Store `paragraph` context when saving (WordInstance already has `paragraph`); the edit modal extends within it. For old cards without paragraph context, adjustment is unavailable (only manual text editing).
- Clause boundaries: Arabic punctuation (، ؛ . ؟ !) and the conjunction و at a word start following a comma; sentence boundaries: . ؟ ! and line breaks.
- Due list (`vocabularyService.getDueForReview`) returns review items as `{ item, style }` pairs; Review renders by style.
- Anki export (if `anki-e2e` exists) maps cloze cards to Anki's Cloze note type; otherwise leave a TODO in that module's spec, not code.

## 7. Edge Cases & Error Handling

- The word appears twice in the sentence: blank the occurrence at the saved location; if unknown, the first.
- Sentence longer than 400 characters: truncate around the word with "…" at the cut ends.
- Card edited so the word no longer appears in the sentence: cloze unavailable; warn in the edit modal.
- Diacritics differ between word and sentence occurrence: match on normalised form.

## 8. Acceptance Criteria

- Sentence on a card can be extended/shrunk in the edit modal and saved.
- Save sentence from a selection creates a card for the tapped word with that sentence.
- Cloze cards review with the word blanked and grade with FSRS; Both creates two independent schedules.
- Existing cards behave exactly as before (style absent = word).
- Unit tests for clause splitting and blanking; e2e for save-sentence and one cloze review.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "sentence-mining": adjustable sentences on cards, "Save sentence" from a selection, and cloze review.

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
- VocabularyItem (src/types/vocabulary.ts) has sentence, location, FSRS fields; WordInstance has sentence and paragraph.
- Sentence extraction: src/reader/wordInteraction/extractSentence.ts.
- Edit modal: src/components/reader/VocabularyEditModal.tsx. Selection toolbar: src/components/reader/SelectionToolbar.tsx (and the new reader's equivalent in src/quietReader).
- Review screen: src/components/review/Review.tsx, due items from vocabularyService.getDueForReview, grading via recordReviewResult and src/vocabulary/fsrs.ts.

Build (read docs/features/sentence-mining.md first; it defines fields and behaviour):
1. Data: optional reviewStyle, sentenceTranslation, cloze FSRS state on VocabularyItem; if needed a clozeDue index (schema bump + migration test). Preference newCardReviewStyle.
2. Edit modal sentence adjustment within the saved paragraph; translation field.
3. Save sentence from the selection toolbar in all readers, with the tap-the-target-word step.
4. Review: due list yields (item, style); cloze rendering with blank and optional root hint; separate scheduling for "both".
5. Unit tests: clause/sentence splitting, blanking with diacritics, due list with both styles. E2E: save sentence, review one cloze card.
6. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/sentence-mining.
```

## 10. Future Extensions

- Audio for the sentence (with `tts`).
- Machine translation suggestion for `sentenceTranslation`, opt-in and clearly marked (network use, privacy gate).
- Multiple sentences per word (collect every sentence the word was looked up in and rotate them in review).
- Cloze with several blanks for phrases and collocations.
