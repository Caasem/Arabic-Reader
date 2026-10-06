# Book difficulty and pre-reading word list

Roadmap id: `book-readiness` · Area: Reader experience · Status: idea · Depends on: nothing hard. The roadmap lists `crowd-ranking`; it is not required (see section 6).

## 1. Purpose

Before starting a book or a chapter a learner wants to know: can I read this, and which words should I learn first? The app already computes most of what is needed: a frequency list with tiers (`src/vocabRarity`: beginner, intermediate, advanced, unlisted), a per-book word index (`bookVocabIndex.ts`) and the Vocab Levels panel that lists a book's words by tier. What is missing is the reader's own knowledge in the calculation (which of these words they have saved and how well they know them), a single readiness number, and a short, actionable list per chapter.

## 2. Expected Behaviour

**Readiness on the book card**
- Each book in the Library shows a **coverage** figure once its word index exists: "You know ~82% of the words" where known = running words (tokens) whose word is in the reader's vocabulary with mastery *known* or *mastered*, or is among the most common words the reader marked as known (see below). It counts tokens, not distinct words, because coverage of running text is what predicts comprehension.
- A coloured band: **Comfortable** (≥ 95%), **Stretch** (90-95%), **Hard** (< 90%). Tooltip explains the bands.
- The index is built in the background when a book is first opened (it is today for Vocab Levels); books never opened show "Open once to estimate".

**Per chapter**
- In the reader's contents (all readers' TOC panels), each chapter shows its coverage and a "Before this chapter" button.
- **Before this chapter** opens a list of the 10-30 words that most raise coverage for that chapter: unknown words ordered by occurrence count in the chapter × (1 + how common they are overall), excluding proper names where the analyser flags them. Each row: word, count in chapter, short gloss, "+" to save, and "Known" to mark it known without saving a card.
- **Save all** saves every listed word as cards (confirmation with count).

**Marking words known**
- "Known" adds the word to a **known-words list** (not a vocabulary card) so it counts as known in coverage and is excluded from future lists. A setting offers "Mark the 500 / 1000 / 2000 most common words as known" for readers who are past beginner level.

## 3. User Flows

1. Library → book shows "~78% · Hard" → open → Contents → chapter 1 "~85%" → Before this chapter → save 12, mark 5 known → chapter now "~92%".
2. Settings → Vocabulary → "Most common words I know: 1000" → coverage figures rise.

## 4. UI / UX Behaviour

- Coverage badge on book cards and the new reader's library hero, in the existing tier colours.
- Pre-reading list as a sheet over the reader (same pattern as the Alt+V book vocabulary drawer, `src/bookVocab`).
- Loading: "Estimating…" while the index builds; progress for long books.
- No coverage shown for books with fewer than 200 Arabic words.

## 5. Data & State

- **Known-words list**: new table `knownWords` (key: normalised form; fields: `word`, `addedAt`, `updatedAt`, `source: 'manual' | 'frequency'`). Class A, **synced** (add to `SYNCED_TABLES`, write through the write layer, migration test, schema version bump).
- Preference `assumedKnownTopN: 0 | 500 | 1000 | 2000` (default 0).
- Coverage cache per book and per chapter: computed from the book index and vocabulary; cache in memory and in a local-only table `bookCoverage` (bookId, chapterHref, coverage, computedAt) invalidated when vocabulary or known words change. Local only, not synced.

## 6. Technical Requirements

- Matching tokens to known words must use the same normalisation the vocabulary uses (`normalizedForm`) and should count a token as known if its **lemma** is known (AraMorph analysis). Lemmatising every token of a long book is expensive: lemmatise distinct forms once, in the AraMorph worker, and cache (form → lemma) per book.
- Proper-name filter: AraMorph POS when available; otherwise skip words starting with a capital-equivalent? (Arabic has none) → use the frequency list's "unlisted" plus a capital-letter-free heuristic: only exclude words tagged as names by the analyser.
- `crowd-ranking` is not needed. If crowd statistics exist later, they can improve the ordering (words other readers looked up most in this book first); keep the ordering function pure so a second signal can be added.
- The ICAC corpus project (`C:\Users\qasim\Videos\Shamela-Readers`) is building a classical-Arabic frequency index; when ready it can replace or supplement the current frequency list through `pack-manager`. Keep the frequency source behind the existing `frequencyStore` interface.

## 7. Edge Cases & Error Handling

- Frequency data not enabled: coverage still works from vocabulary and known words; ordering falls back to in-chapter count only; a note suggests enabling the frequency list.
- Book index fails to build (malformed EPUB): badge shows "Could not estimate".
- Chapters with no text (images): no badge.
- Very large books (> 1M tokens): compute per chapter lazily as chapters are opened.

## 8. Acceptance Criteria

- Book card coverage equals the share of tokens known by the definition above (unit-tested on a fixture book).
- Before-this-chapter list orders by the stated score and excludes known words.
- Marking known updates coverage immediately and syncs to another device.
- Assumed-known top-N setting changes coverage.
- e2e: open sample book, open the list, mark a word known, coverage increases.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "book-readiness": coverage estimates per book and chapter, and a pre-reading word list.

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
- src/vocabRarity: frequency list and tiers (rarity.ts, frequencyStore.ts), per-book word index (bookVocabIndex.ts), export (exportVocabulary.ts); the Vocab Levels panel src/components/reader/VocabLevels.tsx.
- Alt+V drawer pattern: src/bookVocab. Library cards: src/components/library/Library.tsx; LibraryHero in src/look.
- AraMorph lemma/root analysis in the worker (src/dictionary/providers/aramorph).

Build (read docs/features/book-readiness.md first; definitions there are binding):
1. knownWords table (synced, write layer, schema bump, migration test) and assumedKnownTopN preference.
2. Coverage calculation (token-based, lemma-aware, cached), pure and unit-tested on a fixture.
3. Book card badge, TOC chapter badges in all readers, "Before this chapter" sheet with save, Known and Save all.
4. Tests and e2e; npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/book-readiness.
```

## 10. Future Extensions

- Library sorting and filtering by readiness ("books I can read now").
- Graded reading path: suggest the next book with the best coverage gain.
- Use crowd statistics (words most looked up in this book by other readers) as a second ordering signal.
- Swap in the ICAC classical frequency index when it is ready.
