# Import and read PDF

Roadmap id: `formats-pdf` · Area: Formats and export · Status: in progress (step 1, reflow import, built in v0.42.0) · Depends on: `formats-simple` (converter pipeline); page view also needs `popup-extract` · Enables: `device-scan`, `ocr-camera` (scanned PDFs)

> **As built (v0.42.0, step 1: reflow import only):** `.pdf` is accepted in Add Book and converted to an EPUB in `src/importFormats` (`pdf.ts` orchestration and errors, `pdfReflow.ts` lines/paragraphs/headings/verse/running heads, `pdfQuality.ts` the quality test, `pdfBrowser.ts` the pdf.js worker and the AraMorph analyser, `testPdf.ts` a tiny PDF writer used for fixtures; no PDF is committed). pdf.js and its worker load only when a PDF is added; Vite bundles the worker, so it is precached for offline use and packaged in Electron and Capacitor. Differences from the spec below: text that fails the quality test, scanned PDFs and encrypted/corrupt files are **refused** with a message, because the Pages view does not exist yet (no `BookMeta.pdf`, the original PDF is not kept, no view switch); `BookFormat` gains `'pdf'` and the import note reads "converted from PDF · N pages". The quality test uses the first 10 pages with text; it passes when at least 70% of the Arabic words analyse after NFKC normalisation of presentation forms, and reports `reversed` when the words analyse at least 70% (and 20 points better) with their letters turned round. Non-Arabic text skips the dictionary check. Pages with no text in an otherwise textual PDF are left out and reported. Not done: column detection (a two-column page is read as full-width lines), predefined CMaps for legacy CJK-style fonts, footnote linking (small-print notes are kept in small type after the paragraph they interrupt), automatic repair of reversed text. Still to build: Original pages view, OCR.

## Licence (open question for the maintainer)

`pdfjs-dist` (pdf.js) is **Apache-2.0**. This project's `package.json` and README say **GPL-2.0**. Apache-2.0 is generally treated as incompatible with GPL-2.0-only (the Apache patent and termination terms count as extra restrictions); it is compatible with GPL-3.0, and with GPL-2.0-or-later when the combined work is distributed under GPL-3. The licence was not changed in this work. Before a release that includes PDF import the maintainer should decide: relicense the project as GPL-2.0-or-later / GPL-3.0 (the AraMorph data is GPL-2.0 and would need to allow it; check its "or later" wording), or drop `pdfjs-dist` and write another PDF reader, or ship PDF support as an optional separately-licensed download. `NOTICE.md` lists the dependency with this warning.

## 1. Purpose

A large share of Arabic books available to learners are PDFs: publisher files, Shamela and Waqfeya downloads, university notes. Arabic PDF text is hard: many files store letters in presentation forms, in visual (reversed) order, without spaces, or as images only. A reader needs two things: to read the text comfortably with word lookups, and sometimes to see the original page (layout, footnotes, verse layout).

## 2. Expected Behaviour

**Import**
- `.pdf` joins the accepted types. On import the app inspects the PDF:
  - **Text PDF, text extracts cleanly** (see the quality test in section 6): converted to a reflowed EPUB like other formats ("Reflowed text"), with the PDF kept as the book's original so the reader can also view pages.
  - **Text PDF, text is broken** (fails the quality test): the book is added in **Pages** mode only, with a notice "The text in this PDF could not be extracted cleanly. You can read the pages; word lookup works where the text is usable."
  - **Scanned PDF (no text layer)**: added in Pages mode with "This PDF is scanned images. Word lookup needs text recognition (coming later)." (OCR is roadmap item `ocr-camera`.)
- The import report says which mode was chosen and why.

**Reading**
- Books imported from PDF have a **view switch** in the reader's Display settings: *Reflowed text* / *Original pages* (only Pages when reflow was not possible).
- **Reflowed text** behaves like any EPUB: all readers, lookups, saving, highlights, sync of positions.
- **Original pages** shows the PDF pages (fit width; pinch/ctrl-wheel zoom; page number and "Page N of M"; next/previous by key, swipe and buttons). Tapping a word on the page looks it up using the PDF text layer when it is usable; the popup is the normal dictionary popup. Highlights in page view are stored by page and text quads and shown only in page view.
- Position: the last page in page view and the last location in reflowed view are kept separately; switching view opens the corresponding place by searching the text near the current position (best effort).

## 3. User Flows

1. Add `kitab.pdf` (good text) → "Reflowed text · 220 pages" → read reflowed → switch to Original pages to check a table → back.
2. Add a scanned PDF → Pages mode with the notice → read pages; no lookups.
3. Add a PDF with broken text → Pages mode; tapping words where the text is usable opens the popup.

## 4. UI / UX Behaviour

- Pages view uses the app's reader chrome (top bar, footer with page slider).
- Loading pages: grey page placeholder with page number; render ahead by 2 pages.
- Large PDFs (> 300 pages): conversion shows progress; reading pages works before reflow finishes (reflow continues in background and becomes available when done).

## 5. Data & State

- `BookFormat` gains `'pdf'`. `BookMeta.pdf?: { pages: number; reflow: 'ok' | 'broken' | 'none' }`.
- The original PDF is a class B blob (use `blob-store` when available; otherwise a second `bookFiles`-style table `bookOriginals`, schema bump, local only).
- Page-view position: `ReadingPosition` with `cfi` = `pdf:page=<n>`; page highlights: `Highlight.cfiRange` = `pdf:page=<n>;quads=<...>` (synced like other highlights; the other views ignore them).

## 6. Technical Requirements

- Use pdf.js (`pdfjs-dist`, Apache-2.0) in a worker.
- **Quality test** on the first 10 text pages: share of Arabic letters in presentation-form ranges (U+FB50–U+FDFF, U+FE70–U+FEFF), share of words found by AraMorph analysis after normalising presentation forms to base letters (NFKC), and order check (a reversed sample should analyse worse than the forward one). Pass when, after normalisation, ≥ 70% of tokens analyse. Store the score.
- Reflow: group text items into lines and paragraphs by position (right-to-left), detect headings by font size, drop running headers/footers repeated on ≥ 50% of pages, and build an EPUB via the shared builder from `formats-simple`.
- Page view taps: the popup currently lives inside the readers; a page view is a new surface. Use the standalone popup module from `popup-extract` (`openLookup({ word, sentence, anchorRect })`). If `popup-extract` has not landed, ship reflow first and leave page-view lookups for a follow-up.
- Sanitising applies to reflowed HTML.

## 7. Edge Cases & Error Handling

- Encrypted/password PDF: "This PDF is password-protected. Remove the password and add it again."
- Corrupt PDF: "This PDF could not be read."
- Mixed scanned and text pages: reflow only text pages; scanned pages appear as images in the reflowed book with a note.
- Very large (> 500 MB): refuse with a size message.
- Two-column layouts: reflow orders columns right-to-left for Arabic; if detection fails, the quality score usually drops and Pages mode is used.

## 8. Acceptance Criteria

- A clean Arabic text PDF imports as reflowed text with chapters and correct order; words look up.
- A scanned PDF imports as Pages with the notice.
- View switch works and keeps separate positions.
- Unit tests: quality test on fixtures (good, presentation-form, reversed, scanned), line/paragraph grouping.
- e2e: import a small text PDF, read reflowed, switch to pages.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "formats-pdf": import PDFs, reflow good Arabic text into an EPUB, and offer an original-pages view.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: "formats-simple" (docs/features/formats-simple.md) provides the converter pipeline, libraryService.importBook and the shared EPUB builder; check it exists. Page-view lookups need "popup-extract" (docs/features/popup-extract.md); if it does not exist, ship reflow and Pages view without lookups and say so.

Build (read docs/features/formats-pdf.md first):
1. pdf.js in a worker; the text-quality test (presentation forms, AraMorph hit rate after NFKC, order check) with stored score.
2. Reflow converter (lines → paragraphs → headings, header/footer removal) into an EPUB; keep the original PDF (blob store or a local bookOriginals table with schema bump and migration test).
3. Pages view with zoom, paging, page positions, page highlights; view switch in Display settings.
4. Errors per section 7. Licence note for pdfjs-dist.
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/formats-pdf.
```

## 10. Future Extensions

- OCR for scanned pages (`ocr-camera`), then reflow of the OCR text.
- Fix-up tools: let the reader mark a page's text as reversed or choose columns, and re-run reflow.
- Footnote linking in reflowed PDFs.
- Annotated PDF export (highlights burned into a copy).
