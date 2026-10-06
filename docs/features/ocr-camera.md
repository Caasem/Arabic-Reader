# Camera and scanned-page lookup (OCR)

Roadmap id: `ocr-camera` · Area: New surfaces · Status: idea · Depends on: `popup-extract`; scanned PDFs come from `formats-pdf`

## 1. Purpose

Much Arabic reading happens on paper (printed books, class handouts, signs) or in scanned PDFs with no text layer. A learner should be able to point the phone camera at a page, or open a scanned PDF page, and tap words to look them up just like in an EPUB.

## 2. Expected Behaviour

**Camera (mobile first; desktop webcam allowed)**
- Library or nav → **Scan a page** → camera view with a "Capture" button and a torch toggle. After capture: the photo is shown with detected words outlined faintly. Tap a word → popup (source `{ kind: 'image', id, title: 'Scan <date>' }`). Saving records the line of text as the sentence.
- **Keep this scan** (optional) saves the photo and its recognised text as an item on a **Scans** shelf, re-openable later. Otherwise the photo is discarded when the reader leaves.
- **Use as text**: opens the recognised text as a simple book (converted like a TXT import) for comfortable reading.

**Scanned PDFs**
- In the Original pages view of a scanned PDF, **Recognise text on this page** (or "Recognise the whole book", with progress) runs OCR; afterwards words on the page are tappable, and the book can be reflowed (`formats-pdf`).

**Quality and privacy**
- OCR runs **on the device**. Nothing is uploaded. The first use downloads the Arabic recognition model (size shown, via `pack-manager` or bundled lazy chunk) after confirmation.
- Recognition confidence is shown by outline style (solid = confident, dashed = unsure). Unsure words still open the popup with the recognised spelling, editable at the top of the popup ("Recognised as … · Edit").
- Vowel marks are usually lost or wrong in OCR; lookups ignore diacritics.

## 3. User Flows

1. Phone → Scan a page → capture a printed page → tap a word → popup → save.
2. Scanned PDF → page view → Recognise text on this page → tap words.
3. Capture → Use as text → reads the page as a book.

## 4. UI / UX Behaviour

- Capture screen with a frame guide and "Hold steady"; after capture a progress indicator "Reading the page…".
- Low light or blur: "The page is hard to read. Try more light or hold steadier."
- Desktop: webcam or "Choose an image".

## 5. Data & State

- Scans shelf: synced table `scans` (id, title, createdAt, updatedAt, recognisedText, words: boxes with text and confidence) and the image as a class B blob (not synced).
- OCR model: class C pack.
- Recognised text for PDF pages: local table keyed by (bookId, page).

## 6. Technical Requirements

- On-device OCR engine with good Arabic support. Candidates to evaluate (record results and licences in the PR): Tesseract via `tesseract.js` (Apache-2.0; `ara` traineddata), PaddleOCR Arabic models via ONNX Runtime Web (Apache-2.0), and the platforms' native OCR (Apple Vision supports Arabic on recent iOS; Android ML Kit text recognition v2 does not support Arabic as of writing — verify). Choose by accuracy on a 20-page test set of printed Arabic (naskh), measured as word accuracy, and speed on a mid-range phone.
- Word boxes in reading order for RTL lines.
- Camera: `getUserMedia` in web/Electron; Capacitor Camera plugin on mobile.
- Lookups through `openLookup` from `popup-extract` with the word's box as the anchor rect.

## 7. Edge Cases & Error Handling

- Camera permission denied: explain and offer "Choose an image".
- Mixed Arabic and Latin text: recognise both; only Arabic words tappable.
- Handwriting: not supported; say so if recognition confidence is very low across the page.
- Rotated pages: auto-rotate by detected text orientation, with a manual rotate button.

## 8. Acceptance Criteria

- On the test set, the chosen engine reaches the agreed accuracy (record it; target ≥ 90% word accuracy on clean print).
- Camera capture → tappable words → save works on Android and iOS; image import works on desktop.
- Scanned PDF page recognition works and enables reflow.
- No network calls during recognition (verified in tests by stubbing fetch after the model is installed).

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "ocr-camera": on-device Arabic OCR for camera captures, images and scanned PDF pages, with tappable recognised words.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: popup-extract (src/lookup with openLookup) must exist. formats-pdf (Original pages view) for the PDF part; pack-manager for downloading the model (else a lazily loaded chunk). Check what exists.

Build (read docs/features/ocr-camera.md first):
1. Evaluate OCR engines on a 20-page printed-Arabic test set you assemble from public-domain scans (do not commit copyrighted scans; commit only the measurement script and results). Report accuracy and speed; ask the maintainer to confirm the choice.
2. src/ocr/: engine wrapper in a worker, model download with confirmation, word boxes in RTL order.
3. Scan a page flow (camera / image), result view with tappable words and editable recognised spelling, Keep this scan (synced scans table + class B image), Use as text.
4. Scanned PDF: recognise page / whole book, then tappable words and reflow.
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/ocr-camera.
```

## 10. Future Extensions

- Live camera mode (words outlined in the viewfinder without capturing).
- Diacritic restoration on recognised text (a vocalisation model) to aid lookups and TTS.
- Handwriting recognition for students' notes.
- Batch-scan a whole printed book into an EPUB.
