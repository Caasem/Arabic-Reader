# Host Shamela books on our own static host

Roadmap id: `shamela-host` · Area: Content and data · Status: in progress (uploader script written, not committed) · Depends on: `infra-cloud`; `pack-manager` is preferred but not required (see section 6)

## 1. Purpose

The library has a Shamela beta (Settings → Library & data → Shamela; `shamelaEnabled`): search the Shamela catalogue and add a book, which is fetched **page by page** from a third-party proxy (`https://winongkencono-shamelah.hf.space`, `src/shamela/shamelaBooksProvider.ts`), converted to EPUB (`epubBuilder.ts`) and imported. That proxy is outside our control (it can disappear or rate-limit), a book of 800 pages needs 800 requests, and search is limited to what the proxy offers. Hosting a prepared copy of the corpus as static files makes adding a Shamela book one or two requests, reliable, fast and cacheable.

`scripts/shamela-host/upload.mjs` (untracked in the main folder) already uploads a prepared directory to Cloudflare R2 with size and write caps, uploading `catalog.json` last. The source corpus (8,589 books, page text, TOC and metadata) is the dataset the ICAC project uses (`C:\Users\qasim\Videos\Shamela-Readers`, `_meta/` and `stage0_raw/` layout).

## 2. Expected Behaviour

**For the reader**
- Library search shows Shamela results as today (title, author, category, size), but searching is local and instant: the app downloads the catalogue once (`catalog.json`, compressed, a few MB) and searches it on the device (title, author; Arabic normalisation: alef forms, ya/alef maqsura, ta marbuta, diacritics). The catalogue refreshes weekly in the background.
- Filters on results: category (Shamela's categories), author, and size (pages).
- **Add** downloads one compressed book file and builds the EPUB on the device (chapters from the book's TOC, footnotes kept as footnotes, page numbers kept as markers so citations by page work). Progress shows bytes, not pages. Typical book: under 3 seconds on broadband.
- The added book is marked as from Shamela (book card shows a small "Shamela" tag) with the Shamela book id, so re-adding the same book is detected ("Already in your library").
- If our host is unreachable or switched off (remote config), the app falls back to the current proxy path, unless the maintainer disables the fallback.

**For the maintainer**
- A build script turns the corpus into the bucket layout: `catalog.json` (array of `{ id, title, author, authorDeath?, category, pages, bytes, version }`), `books/<id>.json.br` (`{ id, title, author, toc: [{ title, page, level }], pages: [{ n, text, footnotes? }] }`, Brotli compressed), and `meta.json` (corpus version, build date, counts, licence notes).
- Upload with `upload.mjs` within the R2 free tier (≤ 9 GB, write cap), resumable.

## 3. User Flows

1. Library → search "رياض الصالحين" → results instantly → filter category "Hadith" → Add → book in library in seconds.
2. Search a book already added → "Already in your library" → Open.
3. Host down → search still works from the cached catalogue → Add uses the proxy fallback with page progress.

## 4. UI / UX Behaviour

- Existing `ShamelaResultCard` keeps its look; add category, page count, and the "Already in your library" state.
- First use: "Downloading the Shamela catalogue (3 MB)…" with progress; offline first use: "Connect once to download the Shamela catalogue."

## 5. Data & State

- Catalogue: cached in BlobStore/PackManager as a pack `shamela-catalog` if PackManager exists; otherwise IndexedDB (local-only store) with ETag for refresh.
- `BookMeta.source?: { kind: 'shamela'; id: number; version: string }` (synced, so other devices know the book's origin and can fetch the file themselves when it is missing: "Add file" offers **Download from Shamela** for such books).

## 6. Technical Requirements

- Build script in `scripts/shamela-host/build.py` or `.mjs`, reading the corpus layout used by the ICAC project (do not modify that project; read only). Commit the scripts; never commit book data.
- If `pack-manager` exists, publish the catalogue as a signed pack and book files as single-file packs (or a pack kind `shamela-book` with hash in the catalogue). If not, fetch directly with hash verification against `catalog.json` entries (add `sha256` per book).
- Book → EPUB in a worker using the existing `EpubBuilder`; sanitise HTML with the existing rules.
- Remote config switch `shamela` and base URL from `infra-cloud`.
- CORS: `cors.json` allows the app's origins (`https://caasem.github.io`, `app://bundle`, localhost dev/preview). Add Capacitor's origins (`capacitor://localhost`, `https://localhost`) — they are missing today.

## 7. Edge Cases & Error Handling

- Book larger than 50 MB uncompressed: download with progress and build in chunks.
- Corrupt download (hash mismatch): retry once, then "This book could not be downloaded. Try again later."
- Catalogue version changes and a book's content changed: existing library copies are unaffected; "Update available" is a future extension.
- Licence: record in `meta.json` and the spec the terms under which Shamela texts are redistributed; if redistribution of some categories is not allowed, exclude them in the build script by category list.

## 8. Acceptance Criteria

- Catalogue search is local and finds books by normalised title/author.
- Adding a book uses one book file request, builds a correct EPUB (TOC, footnotes, page markers), and detects duplicates.
- Fallback to the proxy works when the host is off.
- Upload of a 100-book sample to staging succeeds within caps; full upload plan documented with size estimate.
- Unit tests for normalised search, book JSON → EPUB, hash check; e2e against a local static server.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "shamela-host": serve Shamela books from our own static host (catalogue + one compressed file per book) and switch the app's Shamela beta to it, keeping the current proxy as fallback.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: infra-cloud (docs/features/infra-cloud.md) for buckets, base URLs and remote config; pack-manager (docs/features/pack-manager.md) if it exists. Check both.

What exists:
- App: src/shamela/ (shamelaBooksProvider.ts calls a third-party proxy page by page; shamelaService.ts downloads and builds an EPUB with epubBuilder.ts; useShamelaBrowse.ts drives search in the Library; ShamelaResultCard.tsx), preference shamelaEnabled.
- Uploader: scripts/shamela-host/upload.mjs and cors.json may exist only as untracked files in C:\Users\qasim\Videos\Arabic-Reader (main folder). Copy them into your branch if missing from git.
- Corpus source: C:\Users\qasim\Videos\Shamela-Readers (ICAC project; read-only), with _meta/*.parquet and stage0_raw/<book>/{book_metadata.json,toc.jsonl,pages.jsonl}. Check its CORPUS_STRUCTURE.md for the full dataset location.

Build (read docs/features/shamela-host.md first):
1. Build script: corpus → catalog.json, books/<id>.json.br (with sha256 in the catalogue), meta.json with licence notes. Never commit book data.
2. Add Capacitor origins to cors.json; upload a 100-book sample to staging with upload.mjs (confirm with the maintainer before uploading).
3. App: local catalogue search with Arabic normalisation and filters; one-request book download, worker EPUB build, duplicate detection via BookMeta.source; "Download from Shamela" for synced books missing their file; proxy fallback; remote-config switch.
4. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/shamela-host.
```

## 10. Future Extensions

- Full-text search across all Shamela books (a server-side index or a downloadable index pack per category).
- Book updates when the corpus version changes.
- Graded collections built with the ICAC frequency index (books sorted by readiness, see `book-readiness`).
- Linking Shamela books to the reader's notes across editions.
