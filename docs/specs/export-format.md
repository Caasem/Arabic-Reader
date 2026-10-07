# Full export format: spec

Status: built locally (2026-10-07, v0.37.0)
Platforms: Web / Electron / Capacitor
Roadmap node: storage-ux
Related: [data-architecture.md](data-architecture.md) (section 5.1 registry, M1h), [storage-ux.md](../features/storage-ux.md), `src/dataExport`

## 1. Goal

The reader can take everything they made in the app out, in open formats, and put it back on another device or in a clean install. This is the answer to lock-in, and the "Export everything" button in Settings → Library & data → Storage.

## 2. Non-goals

- Not a sync mechanism (use the sync folder) and not a replacement for the quick backup (vocabulary and highlights as one JSON file, still in Settings and on the Vocabulary tab).
- Reference data (class C packs, caches) is not exported: it is public and downloaded again.
- Uploaded fonts are not exported. They are often licensed to one person, which is also why they stay out of backups.

## 3. The file

One `.zip`, named `arabic-reader-export-YYYY-MM-DD.zip`, opens with any zip tool:

```
records.json      every class A table, plus the other JSON stores the registry names
vocabulary.csv    one row per saved word: word, meaning, root, lemma, sentence, book, added, mastery, due
highlights.md     highlights and notes, a heading per book
books/            original book files, named <title>__<book id>.epub (optional)
README.txt        what the parts are
```

### records.json

```json
{ "formatVersion": 1, "exportedAt": "2026-10-07T10:00:00.000Z", "appVersion": "0.37.0",
  "tables": { "vocabulary": [ ... ], "highlights": [ ... ], "books": [ ... ] } }
```

`tables` is keyed by the StorageRegistry id of each store whose `exportFormat` is `json`: every synced table (books, positions, vocabulary, highlights, bookmarks, preferences, speedReaderPositions, speedReaderSessions, readingSessions, pomodoroSessions), `wordInstances`, `sensePicks`, and `arabic-reader-personal-dictionary/dictionaries`. Rows are the stored rows as they are. Book records keep their `fileHash`. Sync bookkeeping (outbox, frontiers, device identity), crowd state and caches are not exported.

A test fails when the registry marks a store for export and the export does not carry it (`src/dataExport/dataExport.test.ts`), so this list cannot drift from the registry.

### vocabulary.csv

UTF-8 with a byte order mark (so spreadsheets read Arabic correctly), CRLF line ends, comma separated, fields quoted when they hold a comma, quote or line break. A field that would run as a formula (starting `=`, `+`, `-`, `@` or a tab) gets a leading `'`. Dates are `YYYY-MM-DD`.

### highlights.md

`## <book title>` per book, highlights in the order made, each as a block quote followed by `*colour (chapter)*` and an optional `**Note:** ...`.

### books/

Each original EPUB, stored without further compression. The id after the double underscore is how an import finds the book's record. Books whose file is not on the device (a synced book that never received it) are listed in `records.json` but have no file here.

## 4. Import

`importExport(zip)` (`src/dataExport/importAll.ts`):

1. Refuses, before changing anything, a file that is not a zip, has no readable `records.json`, or has a `formatVersion` above this app's: "This file was made by a newer version of Arabic Reader. Update the app and try again."
2. Vocabulary, highlights and word counts go through the same validation and defaults as the quick backup (`parseBackup`), so a hand-edited file cannot leave Review or the Dashboard reading malformed rows. Other rows must be objects with their key.
3. Restores through the write layer (`bulkPutSynced`), so sync sees the changes. A row is written only if this device has no row with that key, or an older one (`updatedAt`; `lastSeenAt` for word counts). Equal or newer local rows are kept. **Nothing is ever deleted.** The personal dictionary is restored only when none is loaded.
4. Attaches a book file only to a book that has a record and no file on this device.
5. Returns counts (written, kept, skipped, books restored) for the message the reader sees. Restored settings apply after a reload.

## 5. Platforms

The zip goes through `saveFile`: a download in the browser and Electron, the share sheet in the native apps. The whole zip is built in memory, so an export with many large books can be big; the checkbox shows the size and can be turned off.

## 6. Compatibility

`formatVersion` is bumped only for a change an old reader cannot ignore. New tables appear as new keys in `tables`; an import skips keys it does not know.
