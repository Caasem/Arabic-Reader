# Anki integration, end to end

Roadmap id: `anki-e2e` · Area: Formats and export · Status: done in part (v0.37.0; see "As built") · Depends on: nothing (uses `sentence-mining` fields when present) · Enables: `export-hub`

> **As built (v0.37.0):**
> - **Built:** the note type (`src/anki/noteType.ts`); sync that adds, updates, re-sends, relinks older notes and deletes (`ankiSync.ts`); `.apkg` export with sql.js (`apkg.ts`); automatic sync (`AnkiAutoSync.tsx`); and the settings screen.
> - **Different from this spec:** a note is updated only when a hash of its fields changes. Timestamps can't be used, because every save (reviews included) bumps `updatedAt`. Pending deletions are kept per device in localStorage, not in a new table, to avoid a schema version.
> - **Not built yet:** "Use Anki's schedule" mirroring; the AnkiDroid API, whose LGPL compatibility with GPL-2.0 is still to be checked; and the Cloze template, which waits for `sentence-mining`.

## 1. Purpose

Many learners already review in Anki and will not move their reviews into a new app. The app has a basic one-way push (`src/anki`): Settings → Anki → deck name → **Sync to Anki** sends cards not yet sent as Anki "Basic" notes (Front = word, Back = meaning + sentence, tag `arabic-reader`) through the AnkiConnect add-on on the desktop, and marks them `syncedToAnki`. Gaps: edits after the first push never reach Anki; deleted cards stay in Anki; only two fields, so root, lemma, entries and the sentence are flattened; no cloze; no media; no way on phones (AnkiConnect is desktop-only); no file export; nothing comes back from Anki.

This item makes Anki a first-class destination: a proper note type, updates, deletions, an `.apkg` file export for any device, and optional import of review state.

## 2. Expected Behaviour

**Note type**
- The app creates (once) an Anki note type **"Arabic Reader"** with fields: `Word`, `Vowelled`, `Meaning`, `Root`, `Lemma`, `POS`, `Sentence` (word wrapped in `<b>`), `SentenceTranslation`, `Book`, `Source` (dictionary names), `ReaderId` (the card's id, used to find the note again), and two card templates: *Recognise* (front Word, back everything) and, when the card's review style is cloze or both, *Cloze* (sentence with the word hidden). Styling uses an Arabic font stack and RTL.
- Existing users' "Basic" notes keep working; a one-time **Upgrade notes** button converts them (AnkiConnect `updateNoteModel` if available, else leaves them and adds new notes in the new type, with a warning).

**Sync (desktop, AnkiConnect)**
- **Sync to Anki** now does a full pass: adds new cards, **updates** notes whose card changed since the last sync (by `updatedAt` > `ankiSyncedAt`), and, if "Remove deleted cards from Anki" is on (default off), deletes notes for cards removed in the app. Results: "Added 12, updated 3, removed 1, unchanged 230."
- **Automatic sync** (option, off by default): after the app's own folder sync or every 15 minutes while the desktop app is open and Anki is reachable.
- Deck: chosen from a dropdown of Anki's decks (refresh button), or typed new.
- **Review state** (option "Use Anki's schedule", off by default): when on, the app reads each note's card interval and due date from Anki (`cardsInfo`) and shows them in the app (the card's due date in the app follows Anki). The app's own review screen then hides these cards so the reader does not review twice. When off, the two schedules are independent (current behaviour).

**Export file (any device)**
- **Export .apkg**: builds an Anki package of all cards (or the filtered set in the Vocabulary screen) with the same note type, for import into Anki desktop, AnkiDroid or AnkiMobile. Re-importing an updated export updates existing notes because the note GUID is derived from the card id.
- Available on web, Electron, Android, iOS (file saved/shared).

**Android (AnkiDroid)**
- On Android, when AnkiDroid is installed, **Send to AnkiDroid** uses AnkiDroid's content provider API (via a small Capacitor plugin) to add/update notes directly, with the same note type. If the API permission is denied, fall back to .apkg export.

## 3. User Flows

1. Desktop: Settings → Anki → Test connection ✓ → choose deck → Sync → "Added 240" → edit a card's meaning in the app → Sync → "Updated 1".
2. Phone: Vocabulary → Export → Anki package (.apkg) → share to AnkiDroid → imported.
3. Desktop with "Use Anki's schedule": cards' due dates in the app match Anki; Review in the app shows only cards not in Anki.

## 4. UI / UX Behaviour

- Settings → Vocabulary → **Anki** section: connection status line (Connected / Not reachable, with the CORS help that exists today), deck picker, Sync button, last sync time and result, options (remove deleted, automatic sync, use Anki's schedule), Upgrade notes, Export .apkg.
- Progress: "Syncing 120 of 600…".
- Errors: AnkiConnect error messages are shown as returned, prefixed with what was being done ("While updating notes: …").

## 5. Data & State

- `VocabularyItem` gains `ankiNoteId?: number` and `ankiSyncedAt?: number` (keep `syncedToAnki` for old data; treat `syncedToAnki && !ankiNoteId` as "added before ids were stored", and look the note up by `ReaderId` or by Front on the next sync).
- Preferences: `ankiDeckName` (exists), `ankiAutoSync`, `ankiRemoveDeleted`, `ankiUseSchedule`.
- Deleted cards: the write layer already records deletes for sync; keep a local list of deleted card ids with `ankiNoteId` (`ankiTombstones` local-only table, schema bump) until the next Anki sync removes them.

## 6. Technical Requirements

- Extend `src/anki/ankiConnect.ts` with `modelNames`, `createModel`, `findNotes`, `notesInfo`, `updateNoteFields`, `deleteNotes`, `cardsInfo`, `changeDeck`. Keep batching (50 per request).
- `.apkg` writer: an `.apkg` is a zip with a SQLite collection (`collection.anki2` or `.anki21`) and a media map. Use `sql.js` (MIT, WASM) to write the collection; follow the documented Anki schema (version 11 collection works in all current Anki clients). Put this in `src/anki/apkg/` with unit tests that open the produced file with sql.js and check rows.
- AnkiDroid: Capacitor plugin wrapping `com.ichi2.anki.api.AddContentApi` (AnkiDroid API, LGPL-3.0 as a separate library dependency; check compatibility with the app's GPL-2.0 licence and record the result before adding it; if incompatible, use .apkg only).
- HTML escaping exists (`escapeHtml`); keep it for every field.
- Cloze template only for cards whose `reviewStyle` (from `sentence-mining`) is cloze or both; if that field does not exist yet, create only *Recognise*.

## 7. Edge Cases & Error Handling

- Anki closed mid-sync: stop, report what was done, keep progress (cards updated so far are marked).
- Note deleted in Anki by the user: on update, `findNotes` misses it → re-add (or, if the reader prefers, a setting later).
- Duplicate Words in the same deck: allowed (`allowDuplicate` true) since ReaderId distinguishes them.
- Very large collections (10,000 cards): sync in batches with progress; .apkg export streams media none (no media yet) so size stays small.
- AnkiConnect version < 6: "Update AnkiConnect".

## 8. Acceptance Criteria

- Sync adds, updates and (optionally) deletes, with accurate counts; repeated sync with no changes reports "unchanged".
- The note type is created once and fields are filled correctly (unit test with a mocked AnkiConnect).
- .apkg export imports into Anki desktop and AnkiDroid with correct fields and RTL display (manual check, recorded in the PR), and re-import updates instead of duplicating.
- Use Anki's schedule mirrors due dates.
- Old Basic-synced cards are handled without duplicates.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "anki-e2e": a full Anki integration (note type, add/update/delete sync via AnkiConnect, .apkg export for every device, optional AnkiDroid API, optional Anki schedule mirroring).

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
- src/anki/ankiConnect.ts (request helper, ping, deck names, ensureDeck, canAddNotes, addNotes; errors incl. CORS explanation) and src/anki/ankiSync.ts (Basic notes, Front/Back, tag arabic-reader, batches of 50, marks syncedToAnki).
- Settings UI: src/components/shared/settings/AnkiSettings.tsx; preference ankiDeckName.
- VocabularyItem fields in src/types/vocabulary.ts (root, lemma, pos, entries, sentence, custom, syncedToAnki).

Build (read docs/features/anki-e2e.md first; it defines the note type and behaviour):
1. "Arabic Reader" note type (fields, Recognise template, Cloze template only if sentence-mining's reviewStyle exists), created once; Upgrade notes for old Basic notes.
2. Full sync: add, update by updatedAt > ankiSyncedAt, optional delete via a local tombstone table (schema bump, migration test); ankiNoteId/ankiSyncedAt fields; counts; progress; auto-sync option.
3. .apkg export with sql.js in src/anki/apkg/, stable GUIDs from card ids; available on all platforms.
4. Optional: use Anki's schedule (cardsInfo) and hide those cards from in-app review.
5. Optional: AnkiDroid plugin, only after checking licence compatibility (record the finding in the spec).
6. Tests: mocked AnkiConnect unit tests for each sync case; apkg round-trip with sql.js. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/anki-e2e.
```

## 10. Future Extensions

- Two-way sync of edits made in Anki back to the app.
- Media: pronunciation audio (`tts`) and the book's cover as an image field.
- Import an existing Anki deck into the app's vocabulary.
- Per-book subdecks.
