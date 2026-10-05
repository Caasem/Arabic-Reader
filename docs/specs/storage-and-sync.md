# Storage and sync spec

Status: agreed in design interview, 2026-10-05. Not yet implemented.
Platforms: Web, Windows/Mac (Electron), iOS and Android (Capacitor). All run the same web code over IndexedDB (Dexie).

## 1. Principles

- **Local by default.** The app works fully offline with no account. Sync is optional.
- **Sync is not a backup.** A mistake syncs to every device, so backup is a separate feature.
- **Sync is not a launch requirement.** Launch ships reliable backup/restore; folder sync follows within days, Dexie Cloud after that.
- **No backend of ours** for the first two sync options.

## 2. What is protected and what syncs

| Data | Synced | Backed up |
|---|---|---|
| Vocabulary + FSRS review state | Yes | Yes |
| Highlights, notes | Yes | Yes |
| Bookmarks, reading positions | Yes | Yes |
| Preferences | Yes | Yes |
| Book list (ids, titles, metadata) | Yes | Yes |
| Book files | No | Optional |
| Dictionaries, fonts, frequency lists | No | No |

A device that receives a book-list entry with no local file shows "re-import this book".
Irreplaceable: vocabulary and highlights/notes. Annoying to lose: positions, preferences. Replaceable: book files.

## 3. Schema v10 (prerequisite for everything below)

Applies to every user-data table in `src/persistence/schema.ts` (vocabulary, highlights, bookmarks, positions, speedReaderPositions, books, preferences, **and the three session tables**, which get `updatedAt` and `deleted` like the rest, since their merge rule uses `updatedAt` and a session is updated when it ends).

**Sessions:** `readingSessions`, `speedReaderSessions` and `pomodoroSessions` are keyed by `id` and are appended once and updated at most when they end, so real conflicts are rare. They are **backed up and synced**. If folder logs grow too large, they are the first thing to drop from sync, and they stay in backup.
- **Outbox:** a new session row is written through the same persistence-level module as everything else, so it enters the outbox as a `put` event in the same transaction. A session that is later updated (for example its `endedAt` is set) is a second `put` for the same `id`. Sessions are never deleted by sync.
- **Merge:** they use the same frontier mechanism but with a fixed reducer: the union of rows by `id`. For a duplicate `id` with different payloads (a session edited on two devices), the reducer keeps the payload with the larger `endedAt`, then the larger `updatedAt`, then the lexicographically larger `deviceId`; the other payload is logged to Sync activity. This is deterministic and needs no user decision.

- Add `updatedAt: number` (ms epoch) and `deleted?: true` (marker, row retained).
- Every write path sets `updatedAt` and soft-deletes (set `deleted`, bump `updatedAt`). Reads filter `deleted` rows out.
- **Change capture is atomic and immutable.** A `syncOutbox` table holds complete events, written in the **same Dexie transaction** as the mutation. The single write-path layer is a **persistence-level module** (under `src/persistence/`), not a UI hook, and **every writer uses it**: components, imports, background tasks, the migration, and platform code. No write path may bypass it; a test or lint rule should fail on direct writes to user-data tables outside that module. An event is never rebuilt later from the current record, so several edits never collapse into one.
- **Event format (`formatVersion` 1):**
  `{ eventId, deviceId, seq, table, recordId, op: 'put' | 'delete', payload, updatedAt, seen, resolves? }`
  - `payload` is the full record after the change (for `delete`, the tombstone).
  - `seq` is monotonic per device. `seen` is the device's causal vector clock at write time, **not** its dedupe prefix (see "`seen` is a proper vector clock" under Ordering and merge rules).
  - `resolves` (optional) lists event ids this event resolves (see conflict handling).
  - The outbox adds `publishedAt?`. The engine publishes idempotently (`eventId` is the dedupe key) and sets `publishedAt` only after the log write is confirmed.
- **Remote apply never echoes.** Applying a remote event runs in one transaction marked `origin: 'remote'`; the write layer skips the outbox for that origin. A `syncState` table stores `prefix` and `extra` per device, so replays are ignored by the single "already applied" test and our own `clock` advances atomically with the apply.
- **Migration, in this order:**
  1. Before opening the database at the new version, export a backup from the current version and **verify it**: parse it back and compare a **SHA-256 digest of a canonical serialization of each table** (not just row counts). Abort the upgrade if verification fails.
  2. **Where the backup lives:** desktop, the app's user-data folder; mobile, the app's documents directory (not WebView storage); web, a **downloaded, verified export file is the only real safety net**. A copy in a separate IndexedDB database may also be kept as a convenience for quick restore, but it lives in the same browser storage that can be evicted or cleared, so it is never described to the user as a backup and never counts toward the "backup exists" check. Keep native backups 30 days.
  3. **If it can't be saved, or the user declines:** desktop and mobile block the migration and show the reason. On web the user must download the file (the migration waits for the download to be confirmed and re-verified from the saved file where the browser allows it) or explicitly confirm "continue without a backup", and the choice is logged.
  4. Then open at v10; Dexie's upgrade runs as one atomic transaction. Backfill `updatedAt` from `addedAt` / `createdAt` where present, else the migration time.
- Future features that store user data (e.g. per-book definition feedback) use these fields and the outbox from day one.

## 4. Backup

- Manual export/restore (existing format in `src/persistence/backup.ts`), kept working and versioned.
- Automatic scheduled export to a user-chosen location. Desktop and Android first; iOS cannot reliably write to arbitrary folders.
- Web: request persistent storage (`navigator.storage.persist()`). This is only a request; the browser may deny it, so the app must not claim data cannot be evicted. The real protection is the backup reminder and a **verified** export (re-read and counted after writing). iOS Safari can evict IndexedDB after about 7 days.

## 5. Folder sync (ships first)

Engine owned by the app; transport is a folder the user picks (iCloud Drive, Dropbox, OneDrive, Google Drive, Syncthing, etc.).

### Layout
- **Immutable batch files, never appended to.** Each publish writes **one new file** under the device's own folder, `<deviceId>/batch-<firstSeq>-<lastSeq>-<batchId>.json`, containing complete events (`batchId` is random). A file is written once under a temporary name and renamed into place where the transport supports it; it is never rewritten or appended. Readers **ignore files that fail to parse or whose declared event count doesn't match** and retry on the next sync (a partly synced cloud file). Because every file name is unique and nothing is overwritten, there is no check-then-write race: two writers sharing an id (a clone) both leave their files in the folder, and no event is lost.
- Compacted **snapshots are immutable and uniquely named** per device and generation (`snapshot-<deviceId>-<gen>.json`). A device only ever creates new snapshot files and only deletes its own superseded ones.
- **One definition of "applied".** For every peer device, a device (and every snapshot) tracks exactly two things, and the term "watermark" is not used anywhere else:
  - `prefix[d]`: the highest `seq` such that **all** events `1..prefix[d]` from device `d` are applied (contiguous). `prefix` and `extra` are used **only for dedupe**. They are not the causal clock (see `clock` below).
  - `extra[d]`: the set of `seq`s **above** `prefix[d]` that are already applied but not contiguous (a gap sits below them).
  - An event `(d, s)` is **already applied** iff `s <= prefix[d]` or `s ∈ extra[d]`. This is the only dedupe test. Whenever a gap fills, `prefix[d]` absorbs the contiguous run and those entries leave `extra[d]`.
- **Snapshot contents:** the per-record frontiers, plus `prefix`, `extra` and the causal `clock` (below). On join, `clock` takes the pointwise maximum.
- **Reduction (join) rule, deterministic and order-independent:** to join snapshots (and local state) `A` and `B`:
  - `prefix[d] = max(A.prefix[d], B.prefix[d])`.
  - `extra[d] = (A.extra[d] ∪ B.extra[d])` minus anything `<= prefix[d]`, then normalised (absorb any contiguous run into `prefix[d]`).
  - Frontier per record = the **union of both frontiers' events**, with every event removed that another event in the union dominates (happens-before). This is safe even when snapshots overlap or only partly dominate each other, because an event dropped from one frontier was dropped only because a dominating event is in that frontier, and that dominator is carried into the union.
  - The join is commutative, associative and idempotent, so loading snapshots in any order, or re-joining one twice, gives the same result. There is no "newest" snapshot and none is trusted over another.
  - After joining, apply log events not already applied (by the test above).
- **Compaction and pruning:** a device may delete **only its own batch files**, and only when every event in them is (a) covered by one of its own published snapshots (`seq <= prefix`) and (b) older than the 90-day marker window. `prefix` and `extra` are kept permanently in the snapshot and in `syncState`, so an old event that reappears (for example from a restored cloud file) is ignored as already applied rather than replayed as new. Retiring another device (below) is done by writing a new snapshot under the retiring device's id on its behalf only if that device confirms, otherwise its log is simply left in place.
- All files carry a `formatVersion`. Version 1 is plain JSON; encryption is a later opt-in (optional passphrase) and the format must not block it.
- No file is ever written by two devices or rewritten by one, which is what prevents cloud providers from creating "conflicted copy" files.

### Ordering and merge rules
Wall clocks can drift or go backwards, so they do not decide ordering alone.
- Every event carries `deviceId`, a **monotonic per-device `seq`**, and a `seen` map.
- **`seen` is a proper vector clock, not the applied prefix.** A device keeps a `clock`: the componentwise maximum of every applied event's `seen`, plus each applied event's own `seq`. A new event's `seen` is a copy of the clock (excluding the device itself). This matters: if device A has applied B's event but never received C's event that B had already seen, A's next event must still count as causally after C's event. With `seen = prefix`, happens-before is not transitive, the frontier becomes order-dependent, and a late C event can wrongly re-enter. (Implemented in `src/sync/merge.ts`; the property tests fail if `seen` is set to the prefix.) Applying an event past a gap is still safe: the dedupe state (`prefix` / `extra`) tracks what has been *received*, and the clock tracks what is *causally known*.
- `updatedAt` is kept for display and for the "latest wins" policy, but is made monotonic per device: `updatedAt = max(Date.now(), lastUpdatedAtOnThisDevice + 1)`.
- **Happened-before:** A precedes B when `A.deviceId === B.deviceId && A.seq < B.seq`, or, for different devices, `B.seen[A.deviceId] >= A.seq`. If neither precedes the other, they are **concurrent**. Non-concurrent events apply in causal order with no conflict.
  - **Forked device ids.** If a `deviceId` is forked (see Device identity), `(deviceId, seq)` no longer names one event, so `seen[deviceId] >= seq` cannot say which one was observed. For a forked id the engine is **conservative**: events from that id at or above the lowest forked `seq` are treated as **concurrent with every other event for the same record** (including each other and other devices' events), never as superseded, and they are all kept in the frontier. Events below the fork point are unaffected. A later event with `resolves` naming them is the only thing that removes them. Both branches are therefore always retained.
- **Per-record causal frontier.** For every record the engine keeps a **frontier**: the set of events for that record that no other known event precedes (the maximal elements). Applying an event `E`: (1) if `E` is already applied (the single "already applied" test: `E.seq <= prefix[E.deviceId]` or `E.seq ∈ extra[E.deviceId]`; never a highest-seen high-water mark, which cannot prove there are no gaps), do nothing. (2) If **`E` happens-before any frontier event**, the frontier already supersedes it: record `E` as applied and **do not add it**, so a late-arriving old event cannot re-enter. (3) Otherwise add `E` and remove every frontier event that `E` dominates (those that happen-before `E`). (4) **Resolutions:** an event `E` with `resolves` also dominates every event id it names, regardless of causality (this is how forked events, which stay concurrent by policy, get resolved). Because the named events are treated as dominated *by `E`*, a late-arriving old event that those events had superseded is still rejected, and apply order still does not matter. Only events for the same record are compared, so a `resolves` naming another record's event has no effect. A legitimate resolver has applied what it resolves, so its clock covers their history. The frontier is a function of the *set* of events, not the order they arrive in, so any apply order converges to the same frontier. Frontiers are stored in a `recordFrontier` table (event ids plus the payloads needed to reduce them).
- **Reduction:** a frontier of one event is the record's value. A frontier of several concurrent events is reduced deterministically by the winner policy below; the losers stay in the frontier (so a later event that covers them resolves them, and a later event that does not is still correctly seen as concurrent). Only the reduced value is shown and written to the user's table.
- **Concurrent edits to the same record:** the winner is the event with the largest key `(updatedAt, deviceId, eventId)` compared in that order, so the key is total even when two events share a device id (forks). Reading position: furthest point wins, ties broken by the same key. This is a **conflict policy**, not a claim about which edit was really made last: `updatedAt` is monotonic per device only, so clocks that differ can make the policy pick an edit that was earlier in real time.
- Every overwrite is recorded in the **Sync activity** list with an Undo. Sync activity is a **local `activityLog` table** that stores the overwritten (prior) payload itself, so Undo does not depend on the synced logs surviving. It is **not synced or put in snapshots**, and entries are kept **90 days** (the same window as deletion markers), after which the entry and its Undo expire. The UI says so ("Undo available until <date>") and the Sync activity screen states it is a record on this device only, never implying a persistent or remote history. Expired entries are removed silently, with a one-line note on the screen.
- **Concurrent delete vs edit** (detected by the test above, not by timestamps) is the only case that blocks and asks the user (conflict table, folder sync only). **Both versions are preserved** (the edited record is kept in a `conflicts` table, not discarded) until the user decides.
- **Resolutions and Undo are new events, never edits to history.** A resolution is a normal event whose `seen` covers the conflicting events and whose `resolves` names them. An Undo is a compensating event carrying the earlier payload. If the record has changed since the overwrite (a later event not covered by the Undo's `seen`), Undo shows "changed since" and asks the user instead of applying silently.
- Merge must be deterministic and idempotent: applying the same set of events in any order gives the same result.
- CRDT frameworks (Yjs, Automerge) were considered and rejected: they target collaborative editing and would add complexity without benefit for one person's reading data.

### First sync of existing data
Records that existed before the outbox have no events. **The v10 migration does not create events.** The first time sync is turned on for a device, the engine **seeds one `put` event per existing non-deleted record** (and a `delete` event per soft-deleted record still inside the 90-day window) through the normal write-path module, in batches, with ordinary `seq` numbers. Everything in the system is then events, with no special initial-snapshot case. Seeded events carry the record's own `updatedAt`, so a device joining later does not clobber newer data on others. Two devices that each seeded their own copy of the same real-world item (a word added on both) produce two records with different ids; merging those duplicates is a product question, not a sync one, and is out of scope here.

### Deletion markers
- Kept 90 days, then compacted away.
- A device offline longer than 90 days is warned it is out of date and must choose: merge as new records, or replace with the synced copy.

### Triggers
Reliability comes from: the **debounced sync about 10 seconds after the last change**, **sync on next app open**, and a manual **"Sync now"**. Sync on close/backgrounding is **best-effort only**, since browsers and mobile OSes can suspend or kill the app before it finishes. It improves timeliness but nothing may depend on it. The outbox guarantees unpublished changes are retried on the next trigger. No background timer on mobile.

### Device identity and restore
- Random device id plus a user-editable name. The device id and its `seq` counter are stored **in the database, inside the same transaction as the outbox write**, so a `seq` is never reused on one installation.
- **One writer per device id.** The device id is bound to the installation's storage, not to the backup file. A **backup restore** (or any copy of the database to another install) is treated as a *new* device: on restore the engine generates a **fresh device id**, restarts `seq` at 1, keeps the restored data as ordinary records, and publishes them as new events under the new id. The old id's log stays in the folder as history and is never appended to by the restored copy.
- **Copied databases must rotate identity.** An `installId` match cannot prove there is one writer, because an exact clone carries the same `deviceId` and `installId`. So the app never relies on IDs alone:
  - **Binding token:** a random `bindToken` is stored in the database **and** in a second, separate place (desktop: the OS credential store or a file in the user-data folder; mobile: Capacitor Preferences; web: localStorage). If the two disagree or one is missing, the database was copied without its companion (a database-only copy, a restore, a migration to another profile). The engine rotates identity (new `deviceId`, `installId`, `bindToken`, `seq` from 1) before any sync.
  - **Clone detection on read.** There is no check-then-write guard, because batch files are immutable and nothing can be overwritten. Before publishing, a device lists its own folder: batch files covering `seq` values it did not write (an unknown `batchId`, or a `seq` at or beyond its own counter) mean another writer is using its id. It rotates identity as above and republishes its unpublished outbox under the new id.
  - **Reader fork detection.** If any reader sees two different events with the same `(deviceId, seq)` (different `eventId`), or a "conflicted copy" file, that `deviceId` is marked **forked**. For a forked id, dedupe switches from the `prefix` / `extra` test to `eventId`, the conservative causal rule above applies, and Sync activity shows a one-time warning. Nothing is dropped.
  - **Residual risk, stated plainly:** a full-disk clone that writes while offline is detected after the fact, not prevented, because a plain folder offers no lock. The cost is a warning and a few extra concurrent-looking versions, not data loss.
- Reinstall with no local data is the same: new device id, then "Restore from synced folder".
- Sync activity lists devices; "Retire this device" compacts its log into the snapshot.
- On reinstall, offer "Restore from synced folder" first.

### Platform order
0. **Web: no folder sync in version 1.** Folder access needs the File System Access API, which only Chromium desktop browsers have (not Safari or Firefox), and its handles are not reliably persistent. The web build uses manual export/import, and later Dexie Cloud. Chromium-only folder sync can be added afterwards if wanted.
1. Desktop (Electron) and Android first.
2. iOS second, after confirming what the Capacitor file plugins support (security-scoped access, iCloud files not yet downloaded). Until then iOS uses manual export/import.

## 6. Dexie Cloud (ships second, independent)

- Separate path with its own merge behaviour. **No conflict table** for this path.
- Shares only the v10 schema fields with folder sync.
- Open: sign-in method, privacy wording, whether the web extension shares the account. Decide before building.

## 7. UI

- Status dot (synced / syncing / error / last sync time) in Settings and the Library header.
- A badge only when a decision is needed.
- One **Sync activity** screen: overwritten changes with Undo, blocking deletion-vs-edit conflicts, device list.
- No sync UI inside the reader.

## 8. Out of scope here

Definition feedback loop, plugins, graded readers, splash page, PDF OCR, web extension, business model, and the meaning of "ship" (still open). Those reuse this storage design but are specified separately.

## 9. Build order

Folder sync is staged. **Version 1:** outbox, immutable batch files, frontier merge, resolutions, first-sync seeding, restore-as-new-device, binding token. **Hardening pass before wide release:** fork detection, the conservative causal rule for forked ids, and the clone check on publish.


1. Schema v10: verified pre-migration backup, then upgrade, plus the `syncOutbox` table and the single write-path layer, with tests (including a failed-backup abort and a migration of existing data).
2. Backup hardening (persistent storage, auto-export, reminder).
3. Folder-sync engine: change log, snapshot, merge, Sync activity, conflict table.
4. Desktop and Android folder transports; then iOS after plugin check.
5. Dexie Cloud path.
