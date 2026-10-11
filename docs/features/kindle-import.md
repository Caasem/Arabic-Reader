# Import Kindle highlights and vocabulary

Roadmap id: `kindle-import` · Area: Formats and export · Status: idea · Depends on: nothing (uses `formats-simple` to import the books themselves)

## 1. Purpose

Readers who used a Kindle have years of highlights (`My Clippings.txt`) and looked-up words (Kindle's Vocabulary Builder database `vocab.db`). Bringing them in gives the app's review and highlights screens a head start and makes switching easy.

## 2. Expected Behaviour

- Settings → Library & data → **Import from Kindle** opens an importer that accepts `My Clippings.txt` and/or `vocab.db` (the reader connects the Kindle by USB and picks the files: `documents/My Clippings.txt`, `system/vocabulary/vocab.db`).
- **Clippings:** parsed into highlights and notes, grouped by book title and author. The importer shows each book with counts ("Riyad as-Salihin — 34 highlights, 5 notes") and a checkbox.
  - If a book with the same title (normalised) is in the library, highlights are attached to it: the app searches the book's text for each highlight and stores a real location when found. Unfound ones are kept as "unplaced" highlights (shown in Highlights with "Location not found").
  - If the book is not in the library, highlights are imported under a **placeholder book** (no file; card shows "Kindle highlights only. Add the book file to read it."), using the existing "Add file" flow.
  - Bookmarks in clippings are ignored. Duplicate clippings (Kindle writes a new clipping when a highlight is edited) keep only the latest per location.
- **Vocabulary Builder:** each looked-up word with its book and usage sentence becomes a vocabulary card when the reader chooses **Import words** (checkbox per book; option "Only Arabic words", on by default). Cards are created by looking the word up in the app's dictionaries (entries as usual), with `sentence` from Kindle's usage, `bookTitle` from Kindle; the card's `addedAt` is Kindle's lookup time. Words with no dictionary entry are imported as custom cards with an empty meaning flagged "No dictionary entry" so the reader can fill them, or skipped (option).
- Re-running the import skips items already imported (matched by Kindle's identifiers / text + location).
- A summary at the end: "Imported 412 highlights (380 placed), 37 notes, 210 words."

## 3. User Flows

1. Settings → Import from Kindle → choose both files → review list → uncheck two books → Import → summary.
2. Later add the EPUB of a placeholder book via Add file → highlights are re-placed in the text (run placement again on attach).

## 4. UI / UX Behaviour

- Step 1 choose files (with an illustration of where they are on the Kindle), step 2 review, step 3 progress, step 4 summary.
- Errors per file without stopping the other.

## 5. Data & State

- Highlights (`highlights`, synced) with `cfiRange` when placed, or a marker `kindle:unplaced:<loc>` when not; `Highlight.source?: 'kindle'`.
- Placeholder books: `BookMeta` with no file (the sync path already supports books without files) and `format: 'epub'` pending; `BookMeta.placeholder?: 'kindle'`.
- Vocabulary items as usual, with `importedFrom?: 'kindle'` and the Kindle word key to skip duplicates.

## 6. Technical Requirements

- `My Clippings.txt`: UTF-8 with BOM; entries separated by `==========`; header lines in the device language (English, Arabic, others). Parse the type (Highlight/Note/Bookmark), location range and date with patterns for at least English and Arabic Kindle interfaces; unknown languages fall back to "type unknown, keep text".
- `vocab.db`: SQLite (tables `WORDS`, `LOOKUPS`, `BOOK_INFO`). Read with `sql.js` in the browser (MIT, WASM); never upload it.
- Placement: normalised text search over the book's sections (reuse the book search in `src/reader/epub/bookSearch.ts`), choosing the occurrence nearest the Kindle location proportionally.
- New folder `src/kindleImport/` with the touch-point comment.

## 7. Edge Cases & Error Handling

- Clippings for PDFs or personal documents: imported like books.
- Kindle "clipping limit reached" text: skipped with a count in the summary.
- vocab.db from a non-Arabic reader: "Only Arabic words" filters everything → summary says so.
- Corrupt files: "Could not read this file. Make sure it is My Clippings.txt / vocab.db from a Kindle."

## 8. Acceptance Criteria

- Fixture clippings in English and Arabic interfaces parse correctly (unit tests), with duplicates resolved.
- vocab.db fixture imports words with sentences and dates.
- Placement finds highlights in a matching EPUB fixture.
- Re-import creates nothing new.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "kindle-import": import Kindle "My Clippings.txt" highlights/notes and Vocabulary Builder vocab.db words.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists: highlights (src/reader/annotations, Highlight type in src/types/book.ts), vocabulary save paths (vocabularyService, lookupWord/saveLookup in src/vocabulary), books without files (libraryService.listBookFileIds, attachBookFile, "File not on this device" in Library), book text search (src/reader/epub/bookSearch.ts).

Build (read docs/features/kindle-import.md first):
1. Parsers: clippings (English + Arabic headers, duplicates), vocab.db via sql.js.
2. Review UI, placement of highlights in matching library books, placeholder books, word import via dictionary lookup, skip already-imported.
3. Re-run placement when a placeholder book gets its file.
4. Tests with fixtures you write yourself (no real user files committed). npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/kindle-import.
```

## 10. Future Extensions

- Kobo (`KoboReader.sqlite`) and Apple Books annotations.
- Readwise CSV import.
- Export highlights back to Readwise or Markdown.
