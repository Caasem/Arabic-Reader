# Import TXT, Markdown and MOBI/AZW3

Roadmap id: `formats-simple` · Area: Formats and export · Status: done (v0.38.0; see "As built" below) · Depends on: nothing (works better after `blob-store`) · Enables: `formats-pdf`, `watch-folder`, `device-scan`

> **As built (v0.38.0):** `src/importFormats/` with its own EPUB 3 writer (`epubWriter.ts`) rather than the Shamela page builder. Conversion runs on the main thread, not in a worker: foliate-js needs `DOMParser`, which workers lack; a 50 MB limit applies to text files. "Keep original files" is not built yet; it waits for BlobStore. MOBI is tested with a generated file (`convert.test.ts`), not a committed book.

## 1. Purpose

The library accepts only `.epub` (`Library.tsx` rejects anything else with "Only .epub files are supported right now — MOBI files are normalized to EPUB in a later phase."). Readers have Arabic texts as plain text files (copied from Shamela, Wikisource, al-Maktaba), Markdown notes, and Kindle books (MOBI, AZW3). `BookFormat` already has `'mobi'`, and the plan was always to normalise other formats to EPUB on import so every reader, lookup and sync path keeps working unchanged.

## 2. Expected Behaviour

- **+ Add EPUB** becomes **+ Add book** and accepts `.epub, .txt, .md, .markdown, .mobi, .azw3, .azw` (and `.prc` as MOBI). Drag-and-drop onto the library accepts the same.
- Each non-EPUB file is converted to an EPUB **on import**, stored as the book's file, and opened like any EPUB. The book's `format` records the original format (`'txt' | 'md' | 'mobi' | 'azw3'`) for display and later re-conversion. The original file is not kept by default (setting "Keep original files", off), because the EPUB is what the app reads.
- **TXT:** encoding detected (UTF-8 with or without BOM, UTF-16 LE/BE by BOM, Windows-1256 by heuristics when UTF-8 decoding produces replacement characters). Title = first non-empty line if it is shorter than 120 characters, else the file name. Chapters: lines matching a heading pattern (`^(الباب|الفصل|باب|فصل|كتاب|المقدمة|الخاتمة|chapter)\b` or a line of ≤ 60 characters surrounded by blank lines and followed by text) start a chapter; if fewer than 2 headings are found, split every 5,000 words into "Part 1, Part 2…". Paragraphs: blank-line separated; single line breaks inside a paragraph are kept as line breaks (poetry and hadith chains rely on them).
- **Markdown:** CommonMark. `#` and `##` headings become chapters and the table of contents; emphasis, lists, block quotes, tables and links are kept; images that are local relative paths are dropped with a note in the import result; remote images are not fetched (privacy). Front matter `title:` and `author:` are used when present.
- **MOBI / AZW3 (KF8):** text, chapters, table of contents, cover and title/author metadata are converted. DRM-protected files are rejected with: "This Kindle book is protected (DRM). Arabic Reader can only open books without DRM." Right-to-left direction is set from the language (`ar`) or detected from content.
- **Import result:** after converting, a small report under the book card for 10 seconds: "Converted from TXT · 14 chapters" or with warnings ("2 images skipped").
- **Direction and language:** every converted book is marked `dir="rtl"` and `lang="ar"` when more than 50% of letters are Arabic.

## 3. User Flows

1. Library → + Add book → choose `riyad.txt` → "Converting…" → book appears with 12 chapters → open → tap words as usual.
2. Drag `notes.md` onto the library → book with headings as chapters.
3. Add `book.azw3` without DRM → cover and chapters appear. With DRM → error message, nothing added.

## 4. UI / UX Behaviour

- Button label and file picker accept list change; drag-and-drop shows a drop zone outline.
- Progress: "Converting <name>…" on a placeholder card; large MOBI files (> 20 MB) show a percentage.
- Errors appear in the library's existing error banner.
- Settings → Library & data: "Keep original files" (default off).

## 5. Data & State

- `BookFormat` extends to `'epub' | 'mobi' | 'azw3' | 'txt' | 'md'` (add `'pdf'` in `formats-pdf`). `BookMeta.format` is synced; older devices that do not know a format still open the EPUB file, so this is safe.
- `BookMeta.originalFileName?: string`.
- If "Keep original files" is on, the original is stored as a class B blob linked from the book (needs `blob-store`; without it, keep the setting hidden).

## 6. Technical Requirements

- New folder `src/importFormats/` with one converter per format, each `(file: File) => Promise<{ epub: Blob; meta: Partial<BookMeta>; warnings: string[] }>`, and a dispatcher used by `libraryService.importBook(file)` (rename/extend `importEpub`; keep `importEpub` for callers that pass EPUBs, such as starter books and Shamela).
- Build EPUBs with the existing `EpubBuilder` (`src/shamela/epubBuilder.ts`): move it to a shared place (for example `src/epubBuild/`) if it needs to be used outside Shamela; keep Shamela working.
- Markdown parser: a small, maintained, MIT-licensed library (for example `marked` or `markdown-it`); sanitise its HTML output with the same rules as `sanitizeSection.ts`.
- MOBI/AZW3: use a maintained parser. Candidate: the MOBI module of foliate-js (check licence, MIT expected, and vendor only the needed file). Do not write a MOBI parser from scratch unless no usable library exists; if so, stop and report.
- Conversion runs in a Web Worker for files over 2 MB so the UI stays responsive.
- All converted HTML goes through the sanitiser: scripts and event handlers must never survive (the hostile-EPUB e2e test covers EPUBs; add equivalent tests for each converter).

## 7. Edge Cases & Error Handling

- Empty file or no text: "This file has no text to read."
- TXT with mixed encodings: decode as UTF-8 with replacement; warn "Some characters could not be read".
- Huge TXT (> 50 MB): refuse with "This file is too large to convert (limit 50 MB)."
- Markdown with HTML blocks: keep allowed tags after sanitising.
- MOBI with no TOC: chapters from the file's own section breaks; if none, split by size.
- Same file imported twice: existing duplicate handling (`src/library/duplicates.ts`) applies by title+author+size of the converted EPUB.

## 8. Acceptance Criteria

- Each format imports from the picker and by drag-and-drop on web, Electron and Android, producing a readable book with chapters and correct direction.
- Converters are unit-tested with fixtures (Arabic TXT in UTF-8, UTF-16 and Windows-1256; Markdown with headings and front matter; a small DRM-free MOBI and AZW3 created with a free tool and committed only if its content is your own or public domain).
- Sanitiser tests: script tags or handlers in any source never reach the EPUB.
- e2e: import a TXT and an MD, open each, tap a word, popup shows.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "formats-simple": import TXT, Markdown, MOBI and AZW3 by converting them to EPUB on import.

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
- libraryService.importEpub(file, { id? }) in src/library/libraryService.ts reads metadata/cover with epub.js and saves via persistenceService.saveBook(meta, file).
- Library.tsx accepts only .epub and shows an error for others; BookFormat in src/types/book.ts is 'epub' | 'mobi'.
- EpubBuilder (src/shamela/epubBuilder.ts) builds EPUB 2.0 with JSZip from HTML pages. Section sanitising: src/reader/epub/sanitizeSection.ts.
- Duplicate handling: src/library/duplicates.ts.

Build (read docs/features/formats-simple.md first; rules for encodings, chapters and errors are binding):
1. src/importFormats/ with txt, md, mobi/azw3 converters (worker for large files), a dispatcher, and libraryService.importBook(file).
2. Shared EPUB builder location if needed; Shamela must keep working.
3. Library: "+ Add book", accept list, drag-and-drop, progress card, conversion report, errors.
4. BookFormat extension, originalFileName, the "Keep original files" setting only if a blob store exists.
5. Record the licence of any parser you add in this spec's section 6 and wherever the repo lists third-party notices (NOTICE.md).
6. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/formats-simple.
```

## 10. Future Extensions

- DOCX and ODT import (common for teachers' handouts).
- HTML/web-page import (save an article for reading), possibly from the web extension.
- FB2 and CBZ.
- Re-convert a book with improved converters when they change (using `originalFileName` and a kept original).
