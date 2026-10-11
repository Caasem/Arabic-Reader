# Standalone lookup module (popup and tokenizer)

Roadmap id: `popup-extract` · Area: New surfaces · Status: planned · Depends on: nothing hard (`sync-v10` merged first to avoid conflicts) · Enables: `web-extension`, `video`, `audiobooks`, `ocr-camera`, page view in `formats-pdf`, `plugin-api`

## 1. Purpose

Word lookup is the heart of the app, but it only works inside the three book readers. The pieces are tied to a book: `useWordLookups` takes a `BookMeta` and a reading-session tracker; `lookupWord(bookId, …)` records encounters per book; `saveLookup(book, …)` stores `bookId`/`bookTitle`; `DictionaryPopup` positions itself against a word rect from an epub.js iframe; word wrapping (`wrapArabicWords`) walks an epub section's DOM. Every planned new surface (web pages, video subtitles, audiobook transcripts, camera text, PDF pages, plug-ins) needs the same tap → popup → save flow on arbitrary text.

This item extracts a **lookup module** with a small, documented API that any surface can use, without changing behaviour in the readers.

## 2. Expected Behaviour

No visible change for readers in the book readers (all existing e2e specs pass unchanged). New capability for developers:

```ts
// Make Arabic words in an element tappable and handle taps with the standard popup.
const surface = createLookupSurface({
  root: HTMLElement | Document,            // what to scan for Arabic words
  source: LookupSource,                    // where saved words come from (see below)
  getSentence?: (wordEl: HTMLElement) => string | undefined, // default: extractSentence
  container?: HTMLElement,                 // where the popup renders (default document.body)
  onSaved?: (item: VocabularyItem) => void,
});
surface.rescan();      // after the content changes (new subtitle line)
surface.destroy();

// Or open the popup for a word directly (no DOM wrapping), e.g. OCR results.
openLookup({ word, sentence, anchorRect, source });
```

- `LookupSource` = `{ kind: 'book'; book: BookMeta } | { kind: 'web'; url: string; title: string } | { kind: 'video'; id: string; title: string; timeSec?: number } | { kind: 'audio'; id: string; title: string; timeSec?: number } | { kind: 'image'; id: string; title: string } | { kind: 'dictionary' }`.
- Saved cards from non-book sources get `bookId` = a stable id per source (`web:<origin+path hash>`, `video:<id>`, …), `bookTitle` = the source title, and a new optional `VocabularyItem.source` describing it (url, time). Vocabulary screen groups and labels them ("From the web: <title>").
- The popup inside a surface has every popup feature (all dictionaries, saved state, per-entry "+", selection save, edit, add dictionary, clean layout), driven by the same preferences.
- Encounter/lookup statistics (`WordInstance`) are recorded per source id the same way as per book.

## 3. User Flows

Developer flows:
1. A new screen renders Arabic text → `createLookupSurface({ root, source })` → taps open the popup → saves land in Vocabulary with the source label.
2. OCR result → `openLookup({ word, anchorRect, source: { kind: 'image', … } })`.

## 4. UI / UX Behaviour

Same popup and word styles as the readers. Inside a surface, saved words get the same saved-word colouring (`wordStyle.ts`).

## 5. Data & State

- `VocabularyItem.source?: { kind; url?; id?; title; timeSec? }` (synced; optional; old cards have none and are books).
- `WordInstance.bookId` holds the source id for non-book sources.

## 6. Technical Requirements

- New folder `src/lookup/` containing: the surface (`createLookupSurface`, `openLookup`), a React provider/host that renders the popup for surfaces, and re-exports of the tokenizer and wrapper.
- Refactor, in small commits, each keeping all tests green:
  1. `lookupWord` and `saveLookup` take a `LookupSource` instead of `bookId`/`BookMeta` (with a book adapter so reader code changes minimally).
  2. `useWordLookups` becomes a thin reader wrapper around a source-agnostic lookup controller (popup state, saving, toasts, quick-add, Space save if present).
  3. `DictionaryPopup` positioning accepts a plain `DOMRect` in the container's coordinate space (it already accepts `wordRect`); remove remaining iframe assumptions.
  4. `wrapArabicWords` and the delegated click handling become usable on any element (they are nearly there; the epub section remains one caller).
- Bundle: the module must be importable by a separate entry point (the web extension builds its own bundle) without pulling in epub.js or the readers. Check with a build of a tiny test entry.
- Coordinate with `dict-fullpage` (it extracts the entry list renderer); whichever lands second uses the other's component.

## 7. Edge Cases & Error Handling

- Root with no Arabic text: surface does nothing.
- Content changes without `rescan`: new words are not tappable (documented); a `MutationObserver` option `observe: true` handles dynamic content.
- Two surfaces on one page: one popup at a time; opening in one closes the other.
- Shadow DOM and iframes: supported only if the root passed is inside them; documented.

## 8. Acceptance Criteria

- All existing unit and e2e tests pass unchanged.
- A test page (not shipped) uses `createLookupSurface` on a static Arabic paragraph: taps open the popup, saving creates a card with `source.kind: 'web'`.
- `openLookup` works with only a word and a rect.
- The module builds into a separate entry without epub.js (bundle-size check in CI or a test).

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "popup-extract": extract word lookup (tokenize → tap → dictionary popup → save) into a standalone module usable on any text, without changing behaviour in the book readers.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists (all book-bound): src/components/reader/hooks/useWordLookups.ts (popup/bubble state, saves, toasts, quick-add), src/vocabulary/lookupWord.ts (lookupWord(bookId,…), saveLookup(book,…)), src/components/reader/DictionaryPopup.tsx (positions from wordRect), src/reader/wordInteraction/{wrapWords,sectionInteractions,extractSentence,wordStyle,rectInHost}.ts, src/reader/tokenizer/arabicTokenizer.ts.

Build (read docs/features/popup-extract.md first; the API in section 2 is the target):
1. LookupSource type; VocabularyItem.source (optional, synced); lookupWord/saveLookup take a source (book adapter for readers).
2. Source-agnostic lookup controller; useWordLookups wraps it for the readers.
3. src/lookup/ with createLookupSurface, openLookup, a popup host; MutationObserver option.
4. Vocabulary screen labels non-book sources.
5. A dev-only test page and a test that the module builds without epub.js.
6. Small commits, each green: npm run test:unit, npm test, npm run build. Version, CHANGELOG (developer-facing change; one line), roadmap status; branch feat/popup-extract.
```

## 10. Future Extensions

- A tiny embeddable script for other websites (teachers' pages) using the same module.
- Hover preview (exists in the epub reader as HoverPreview) for surfaces.
- Plug-in API exposure (`plugin-api` will expose `openLookup` and surfaces to plug-ins).
