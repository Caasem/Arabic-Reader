# Web extension

Roadmap id: `web-extension` · Area: New surfaces · Status: idea · Depends on: `popup-extract` · Enables: `plugin-api` (as a learning case)

## 1. Purpose

Learners read Arabic on the web too: news, Wikipedia, forums, Telegram Web, Islamic sites. A browser extension brings the same tap-to-define popup to any page and saves words into the same vocabulary, so web reading feeds the same review.

## 2. Expected Behaviour

- Available for Chrome/Edge (Manifest V3) and Firefox. Safari later.
- **Activation:** the toolbar button toggles lookup on the current tab (badge "ON"). Options: "Always on for these sites" (list), and a keyboard shortcut (default Alt+Shift+A) to toggle.
- When on, Arabic words on the page become tappable (no visual change until hovered: dotted underline on hover). Click a word → the standard popup with the reader's enabled dictionaries. Saving works as in the app; cards are labelled with the page title and URL (`source.kind: 'web'`). Saved words on the page get the saved colour.
- **Offline dictionaries:** AraMorph (English) is bundled in the extension. Other dictionaries the reader uses in the app are available if the reader enables "Download dictionaries into the extension" (each shows size) — data lives in the extension's IndexedDB.
- **Getting words into the app.** The extension has its own storage and cannot read the app's IndexedDB, which belongs to a different origin. It also cannot join folder sync, because extensions cannot write to arbitrary folders. So:
  - **Pairing with the desktop app:** the desktop app (Electron) runs a localhost endpoint `http://127.0.0.1:<port>` only while "Allow the browser extension" is on in its settings; pairing uses a one-time 6-digit code shown in the app. The extension sends saved cards to the app, which writes them through the write layer (so they sync onward).
  - **Without the desktop app:** the extension keeps a queue; **Export to app** downloads a file the reader imports in the app (same format as the export hub's JSON), or, when the web app (PWA) is open in the same browser, the extension hands cards over through a content script on the app's origin (`https://caasem.github.io/Arabic-Reader/`), which writes them.
- The extension never sends page text anywhere. It needs only `activeTab`, `storage`, `scripting`, and host permission requested per site when "always on" is chosen.

## 3. User Flows

1. Install → open an Arabic news site → click the toolbar button → click a word → popup → Save → toast "Saved. 3 words waiting to go to Arabic Reader."
2. Pair with the desktop app → saved words appear in the app within seconds.
3. No desktop app → open the web app → the extension hands over the queue → Vocabulary shows them under "From the web".

## 4. UI / UX Behaviour

- Popup visuals identical to the app's (shared module); fonts bundled.
- Extension popup (toolbar): on/off for this tab, queue count, pairing status, link to options.
- Options page: sites, shortcut, dictionaries to download, pairing, clear queue.

## 5. Data & State

- Extension IndexedDB: dictionaries, queue of saved cards (full `VocabularyItem` shape with `source`), known saved words (for colouring, synced back from the app on pairing).
- App side: the handover endpoint writes cards through `vocabularyService` and records the extension as a source.

## 6. Technical Requirements

- New top-level folder `extension/` with its own Vite build (entry: content script using `src/lookup` from `popup-extract`, background service worker, options page). Shared code is imported from `src/`, not copied.
- Content script injects into the page in a Shadow DOM root for the popup so page CSS cannot break it and its CSS cannot leak.
- Electron localhost endpoint: bind 127.0.0.1 only, random port, pairing token, CORS limited to the extension's origin (`chrome-extension://<id>`, `moz-extension://<id>`), and rate limit. Off by default.
- Licences: bundled dictionary data must allow redistribution in the extension (AraMorph/Buckwalter is GPL; the extension must be GPL-compatible and include the notice).
- Store listings are outward-facing: prepare, but the maintainer submits.

## 7. Edge Cases & Error Handling

- Pages that re-render constantly (React apps): MutationObserver rescans with throttling.
- Text in iframes: handled only for same-origin frames.
- Editable fields (comment boxes): never wrap words inside inputs, textareas or contenteditable.
- Pairing lost (app closed): queue keeps cards; badge shows the count.
- Huge pages: wrap only visible text (IntersectionObserver), lazily.

## 8. Acceptance Criteria

- On three real sites (a news site, Arabic Wikipedia, a forum), toggling on makes words tappable, popup works, saving queues cards.
- Pairing with Electron delivers cards that then appear in the app and sync.
- Handover to the PWA works without the desktop app.
- Permissions minimal; no network calls from the extension except to the paired localhost and pack downloads.
- Automated tests: content script on fixture pages (Playwright with the extension loaded).

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "web-extension": a Chrome/Edge (MV3) and Firefox extension that makes Arabic words on any page tappable with the app's dictionary popup and sends saved words to the app.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: popup-extract (docs/features/popup-extract.md) must have created src/lookup with createLookupSurface and a LookupSource of kind 'web'. Stop if it does not exist.

Build (read docs/features/web-extension.md first):
1. extension/ with its own Vite build: content script (Shadow DOM popup, IntersectionObserver wrapping, MutationObserver rescans), background worker, toolbar popup, options page; AraMorph bundled; optional dictionary downloads.
2. Queue of saved cards in extension storage.
3. Electron: opt-in localhost endpoint with pairing code (127.0.0.1, random port, token, CORS to the extension origin), writing cards through vocabularyService.
4. PWA handover via a content script on the app origin.
5. Licence notices for bundled data. Do not submit to stores; prepare listing text in extension/STORE.md.
6. Tests: Playwright with the unpacked extension on fixture pages; unit tests for queue and pairing. npm run test:unit, npm test, npm run build (app and extension); version, CHANGELOG, roadmap status; branch feat/web-extension.
```

## 10. Future Extensions

- Safari extension (Xcode wrapper).
- YouTube subtitles in the browser (with `video`).
- Reading mode: clean an article and open it in the app as a book (with `formats-simple` HTML import).
- Account-based handover if `dexie-cloud` ships.
