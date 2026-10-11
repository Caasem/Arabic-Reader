# Hashiya mode: annotate the text on an open canvas

Roadmap id: `hashiya` · Area: New surfaces · Status: idea · Depends on: `plugin-api` (built as a first-party plug-in), or built in core if the plug-in API is not ready (see section 6)

## 1. Purpose

The classical Arabic scholarly tradition works by layers: a core text (matn), a commentary (sharh) around it, and marginal glosses (hashiya) on the commentary, written in the margins, between lines and in boxes linked to words. A serious student studies the same way: copying a passage, writing glosses around it, drawing links between a word and its explanation, adding tables of grammar (i'rab) and root notes. Highlights with notes (what the readers support now) are too narrow for this.

Hashiya mode turns a passage into an editable, infinite canvas (in the spirit of Miro or Excalidraw) where the reader lays out the text and builds their own layers of commentary around it.

## 2. Expected Behaviour

**Starting**
- Select a passage in any reader (up to about 2,000 words) → toolbar **Open in Hashiya** (or Alt+H). A new **sheet** is created with the passage placed in the centre as a **text block** (the matn), keeping its paragraphs, linked to its location in the book.
- Sheets are listed on a **Hashiya** screen (nav) and per book in the reader's drawer.

**Canvas**
- Infinite canvas with pan (drag empty space, two-finger on touch), zoom (wheel/pinch, 10%-400%), fit-to-content.
- Element types:
  - **Text block** from the book: words are tappable (dictionary popup via `openLookup`); the block can be split at a sentence boundary into two blocks, and its line spacing increased to leave room between lines (interlinear glosses). Book text in blocks is not editable (it is the source), but individual words can be styled (colour, underline, circle).
  - **Note** (sticky note): free text, RTL/LTR auto, colours, resizable.
  - **Gloss**: a short note **attached** to a word or span in a text block, drawn in the margin with a thin connector line to the word; moves with the block.
  - **Interlinear gloss**: small text placed directly above or below a word, attached to it.
  - **Connector**: an arrow or line between any two elements, with an optional label.
  - **Box/frame**: groups elements, with a title (e.g. "I'rab", "Vocabulary", "Questions").
  - **Table**: rows and columns of text (for i'rab and conjugations).
  - **Word card**: drag a word from a text block to the canvas → a card with its saved vocabulary entry (or "Save" if not saved).
  - **Pen** (touch/stylus): freehand strokes, colours, eraser.
- Selection, multi-select, move, resize, duplicate, delete, align, bring forward/back, undo/redo (Ctrl+Z / Ctrl+Shift+Z, 100 steps), copy/paste within and between sheets.
- **Layers** panel: matn, sharh, hashiya, and custom layers; each element belongs to one; layers can be hidden/locked. Default: book text on "Matn", notes on "Hashiya".
- **Export**: PNG and SVG of the visible area or the whole sheet, PDF (one page fitted or tiled), and a Markdown outline (book text with glosses as footnotes).
- Autosave on every change (debounced 1 s); sheets sync between devices.

## 3. User Flows

1. Reading a hadith commentary → select the hadith → Open in Hashiya → write glosses on three words with connectors → box "Vocabulary" with word cards → export PNG to share with a study group.
2. On a tablet with a stylus → draw circles around particles → interlinear i'rab notes above each word.
3. Back in the book → the passage shows a small "Hashiya" marker; tapping it opens the sheet.

## 4. UI / UX Behaviour

- Tool bar (left, vertical; bottom on phones): select, hand, note, gloss, connector, box, table, pen, eraser, text style.
- Properties panel for the selected element (colour, font size, layer).
- Minimap in a corner for large sheets.
- Empty sheet hint: "Drag the text to arrange it. Double-click empty space to write a note."
- Performance target: 60 fps panning with 500 elements on a mid-range laptop; 30 fps on a mid-range phone.

## 5. Data & State

- Synced table `hashiyaSheets` (id, title, bookId?, sourceLocation?, createdAt, updatedAt, elements: JSON document) — the document is one JSON value; with concurrent edits on two devices, sync's last-write-wins per record would lose one side. So store **elements as separate rows** in a synced table `hashiyaElements` (id, sheetId, type, data, z, layer, updatedAt) so concurrent edits to different elements merge; same-element conflicts use last write (with Sync activity Undo).
- Freehand strokes as compact point arrays (simplified, ≤ 1 KB per stroke typical).
- Book location markers: derived from sheets with `bookId` + `sourceLocation`.
- Exports are files, not stored.

## 6. Technical Requirements

- Preferred: build as the first first-party plug-in on `plugin-api` (reader panel + command + own storage), which proves the API on a demanding case. If the plug-in API does not exist and the maintainer wants Hashiya first, build it as a core feature folder `src/hashiya/` with the usual touch-point comment, and keep its boundary clean (only `src/lookup`, vocabulary service, and a selection bridge) so it can move into a plug-in later.
- Rendering: evaluate an MIT-licensed canvas library (for example Excalidraw's packages, tldraw — check licence, as tldraw's licence is not MIT for production use; Konva; or a custom SVG layer) for RTL text quality, Arabic shaping in canvas text, touch/stylus support and bundle size. Arabic text must be rendered by the browser's text engine (HTML/SVG text), not by drawing glyphs manually, so shaping and diacritics are correct. Record the decision.
- Text blocks are HTML/SVG text with the reading font, positioned on the canvas, so word taps and selection work.
- Export: SVG from the scene, PNG via canvas rasterisation, PDF via a small library (e.g. jsPDF, MIT) or print-to-PDF on desktop.

## 7. Edge Cases & Error Handling

- Passage longer than the limit: "Hashiya works on up to about 2,000 words at a time. Select a shorter passage."
- Book removed: sheets keep their text (copied at creation) and lose only the jump-back link.
- Very large sheets (> 2,000 elements): virtualise off-screen elements; warn at 5,000.
- Concurrent edit of the same element on two devices: last write wins, overwritten version in Sync activity with Undo.
- Device without a stylus: pen tool works with mouse/finger.

## 8. Acceptance Criteria

- Create a sheet from a selection in each reader; all element types work; attached glosses and interlinear notes follow their words when blocks move.
- Word taps in text blocks open the popup; drag-to-word-card works.
- Undo/redo, layers, export PNG/SVG/PDF/Markdown work.
- Sheets sync and merge per element between two devices (engine test with two databases).
- Performance targets met on reference devices (recorded).

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "hashiya": an infinite-canvas annotation mode where a selected passage becomes text blocks surrounded by notes, attached glosses, interlinear glosses, connectors, boxes, tables, word cards and freehand ink, synced per element.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: popup-extract (src/lookup/openLookup) is required for word taps. plugin-api is preferred: if src/plugins exists, build Hashiya as a first-party plug-in; if not, ask the maintainer whether to build it in core (src/hashiya/) with a clean boundary.

Do (read docs/features/hashiya.md first; element types and behaviours there are binding):
1. Evaluate canvas libraries for Arabic text quality, touch/stylus, licence and size; write the choice into the spec; ask the maintainer to confirm.
2. Data: synced hashiyaSheets and hashiyaElements (per-element rows), schema bump, migration test, write layer.
3. Canvas with tools, selection, undo/redo, layers, minimap; text blocks from selections with tappable words; attachments that follow words; word cards.
4. Entry points: toolbar "Open in Hashiya", Alt+H, Hashiya screen, book drawer list, in-book markers.
5. Export PNG/SVG/PDF/Markdown.
6. Tests per section 8 (unit for attachment geometry and per-element merge; e2e for create/annotate/export). npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/hashiya.
```

## 10. Future Extensions

- Classical layouts: generate a printed-style page with matn in the centre and sharh/hashiya around it from a sheet.
- Shared sheets for study circles (needs accounts or shared folders).
- Templates (i'rab table, root analysis, poem scansion grid).
- Linking sheets to each other across books (a personal sharh library).
- Handwriting recognition for ink notes.
