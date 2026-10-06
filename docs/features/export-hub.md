# Export hub: Quizlet, Notion, CSV and more

Roadmap id: `export-hub` · Area: Formats and export · Status: idea · Depends on: `anki-e2e` (shared export model)

## 1. Purpose

Learners keep vocabulary in many places: Quizlet sets, Notion databases, spreadsheets, Memrise-style tools, teachers' worksheets. Today the app can push to Anki and write a plain word list per book (Vocab Levels export). There is no general way to take saved words out in the format another tool expects.

## 2. Expected Behaviour

- Vocabulary screen → **Export** button opens the export sheet. It applies to the cards currently shown (the screen's filters: book, mastery, due, search) or "All cards" (toggle).
- Choose a **destination**, each with a preview of the first 5 rows and a short "How to import this" note:
  - **CSV (spreadsheet)**: UTF-8 with BOM (Excel opens Arabic correctly), comma separated, header row. Columns chosen by checkboxes from: Word, Vowelled, Meaning, Root, Lemma, POS, Sentence, Sentence translation, Book, Added, Mastery, Next review, Notes, Dictionary. Default: Word, Meaning, Root, Sentence, Book.
  - **Quizlet**: plain text, term and definition separated by Tab, cards separated by newline (Quizlet's import format). Definition = Meaning (+ sentence on a new line inside the definition if "Include sentence" is checked; Quizlet keeps line breaks when the definition is quoted). Button **Copy to clipboard** (Quizlet import is a paste box) and **Save .txt**.
  - **Notion**: a CSV with Notion-friendly columns (Word as the title column, Tags = book and mastery as multi-select text) and a note: "In Notion: … → Import → CSV". Also **Copy as Markdown table** for pasting into a page.
  - **Markdown**: a document grouped by book, each card as `**word** — meaning` with the sentence as a quote.
  - **Anki**: links to the Anki section (`anki-e2e`) for .apkg and sync; not duplicated here.
  - **JSON**: the app's card JSON (for developers and backups of a subset).
- **Export** saves or shares the file (web download, Electron save dialog, Capacitor share sheet). Copy actions use the clipboard.
- The last destination and column choice are remembered per device.

## 3. User Flows

1. Vocabulary → filter book "Riyad" → Export → Quizlet → Copy → paste into Quizlet import.
2. Vocabulary → Export → CSV → tick Root and Sentence → Save → opens in Excel with correct Arabic.
3. Vocabulary → Export → Notion → Save CSV → import into Notion.

## 4. UI / UX Behaviour

- Sheet with destination tabs on the left (list on phones), options, preview table (RTL cells for Arabic), and the action buttons.
- Count line: "Exporting 128 cards".
- Empty selection: "No cards match the current filters."

## 5. Data & State

- Read-only over vocabulary. Preference/localStorage: `exportHub.last` (destination and columns).

## 6. Technical Requirements

- New folder `src/exportHub/` with a shared row model `ExportCard` (built once from `VocabularyItem` + book titles) and one writer per destination `(cards, options) => { filename, mime, text | Blob }`. The Anki item's exporter should use the same `ExportCard` model; if `anki-e2e` landed first with its own model, refactor both onto one.
- CSV writer: RFC 4180 quoting, BOM, `\r\n` line endings.
- Strip HTML from meanings for plain formats; keep line breaks.
- Clipboard: `navigator.clipboard.writeText`, with a fallback textarea for older WebViews.

## 7. Edge Cases & Error Handling

- Tabs or newlines inside fields: CSV quotes them; Quizlet replaces tabs with spaces and wraps multi-line definitions in quotes.
- Custom (hand-written) cards: Meaning is their back text; Dictionary column empty.
- Very large exports (> 20,000 cards): build the file in chunks; the preview still shows 5 rows.
- Clipboard denied: show "Copy failed. Use Save instead."

## 8. Acceptance Criteria

- Each destination produces a file that imports correctly into its target (manual check notes in the PR for Quizlet, Notion, Excel/LibreOffice).
- Filters apply; counts match.
- Unit tests for each writer with Arabic, commas, quotes, tabs and newlines in fields.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "export-hub": export saved vocabulary to CSV, Quizlet, Notion, Markdown and JSON from the Vocabulary screen.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: "anki-e2e" (docs/features/anki-e2e.md) shares the export row model. If it exists, reuse/refactor its model; if not, create ExportCard here and leave Anki to adopt it.

What exists: Vocabulary screen (src/components/vocabulary, the VocabularyList view in App.tsx) with filters; VocabularyItem in src/types/vocabulary.ts; vocabularyService.list(); a per-book word-list export in src/vocabRarity/exportVocabulary.ts (different purpose, leave it).

Build (read docs/features/export-hub.md first; formats are defined there):
1. src/exportHub/ with ExportCard and writers (csv, quizlet, notion csv + markdown table, markdown, json).
2. Export sheet from the Vocabulary screen using current filters; preview; save/share per platform; clipboard copy.
3. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/export-hub.
```

## 10. Future Extensions

- Direct Notion API export (OAuth, opt-in) instead of CSV.
- Printable worksheets (PDF) with word, blank, sentence.
- Google Sheets export.
- Import from these formats (CSV/Quizlet) into vocabulary.
