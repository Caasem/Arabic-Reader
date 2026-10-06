# Data architecture: local and cloud

Status: design ready for the maintainer's review (2026-10-06). Written by a separate session from older copies of the docs, then corrected for decisions taken the same day: ADR 0002 (revised), 0003 and 0005 accepted; user files only through the reader's own folder; Dexie Cloud and the storage screen in M1. Umbrella spec: it names the layers, fixes the interfaces and the rules between them, and defines milestone M1. Each layer gets its own detailed spec when built.
Platforms: Web / Electron / Capacitor
Roadmap nodes: data-arch-spec, blob-store, pack-manager, dexie-cloud, infra-cloud, storage-ux.
Related: [storage-and-sync.md](storage-and-sync.md) (layer A, built), [crowd-sense-ranking.md](crowd-sense-ranking.md) (layer D), [ADR 0002](../adr/0002-local-first-backend-exception.md), [ADR 0003](../adr/0003-four-data-classes.md), [ADR 0005](../adr/0005-cloudflare-hosting.md), [ADR 0007](../adr/0007-static-pack-hosting.md).

## 1. Goal

Fix one storage model so that PDFs, audio, video, the poetry corpus, hosted Shamela books, crowd data and plug-ins plug into shared layers instead of each inventing storage, download logic and a privacy story. The reader gets: nothing leaves the device unless they choose, every feature works offline, they can see and free their space, and they can export everything.

## 2. Non-goals

- No accounts, and no server holding user content (ADR 0002).
- No change to the class A sync design (storage-and-sync.md stands).
- No plug-in API in M1; only the namespace is reserved (section 8).
- No encryption at rest in M1 (the sync format already leaves room for opt-in encryption).

## 3. The four data classes

Every piece of data belongs to exactly one class. The class decides where it lives, whether it syncs, and whether it can leave the device.

| Class | Examples | Size | Owner | Local home | Cloud home | Syncs between devices |
|---|---|---|---|---|---|---|
| **A. User records** | vocabulary, FSRS state, highlights, notes, bookmarks, positions, preferences, book list | small, many rows | the reader | Dexie (IndexedDB), through the write layer | none by default; optional sync transport | Yes, merged row by row |
| **B. User files** | imported books, PDFs, audio, uploaded fonts, user dictionaries | large, immutable | the reader | BlobStore | optional, user-chosen (their folder or cloud), never ours | Optional, by content hash, through the user's own folder only |
| **C. Reference packs** | dictionaries, Shamela books, poetry corpus, frequency lists, Anki templates | large, public, versioned | us | BlobStore, managed by PackManager | static host (R2) | No, each device downloads its own |
| **D. Aggregate data** | crowd votes up, rankings down | tiny up, medium down | us | outbox queue and a signed ranking file | ingest API plus ranking file | No, never merged into A |
| **L. Local-only derived** | caches, `wordInstances`, `bookLocations`, search indexes | any | the app | Dexie or cache | none | No, rebuildable, in backup only if cheap |

Rules between classes:
- A never contains B or C content, only references (a content hash or a pack id and version).
- D never touches A's sync tables (required by the crowd spec).
- Only A and B belong to the reader. C, D and L are replaceable.
- Eviction order under space pressure: L, then C, then nothing else automatically. A and B are only ever removed by the reader.

## 4. Current state inventory (what M1 starts from)

Audited 2026-10-06. This is what each existing store becomes.

| Today | Where | Class | M1 action |
|---|---|---|---|
| vocabulary, highlights, bookmarks, positions, books, preferences, sessions | Dexie `arabic-reader` v10 | A | none; already in `SYNCED_TABLES` |
| `bookFiles` (`{bookId, data: Blob}`) | Dexie | B | move to BlobStore, `books.fileHash` added (section 6) |
| `bookLocations`, `wordInstances` | Dexie | L | stay; declared local in the registry |
| User fonts | `src/readerFont/userFonts.ts` own store | B | move to BlobStore in M1b (low risk, small) |
| Personal dictionaries | `src/dictionary/providers/personal/store.ts` | B | move to BlobStore in M1b |
| Aramorph / dictionary data | bundled in `public/*-data` (about 30 MB) and a local store (`providers/aramorph/store.ts`) | C | M1 proof: Al-Sihah or Al-Maqayis becomes the first pack (section 7) |
| Frequency list | `src/vocabRarity/frequencyStore.ts` | C | pack, after the proof |
| Shamela books | `scripts/shamela-host` (upload tooling only) | C | pack, build step 4 |
| Sync outbox, frontier, activity, conflicts, syncMeta | Dexie | A-support, local | none; never synced |
| Crowd outbox | built locally, not deployed | D | CrowdClient, build step 6 |

Bundled data in `public/` ships inside the app today. Moving a dictionary to a pack means the installer shrinks and the dictionary is downloaded on first use; the offline promise is kept by downloading once and caching, and by keeping a small "starter" set bundled (decision D4).

## 5. Layers and interfaces

```
 UI and features
      |
 Repos (vocabularyRepo, booksRepo ...)  <- only way features touch class A
      |
 Write layer (writeLayer.ts)            <- updatedAt, outbox capture, atomic
      |
 Dexie schema vN + migration gate       <- backup before every upgrade

 StorageRegistry  <- one table: every store, its class, sync rule, eviction rule
 BlobStore        <- class B and C bytes, addressed by content hash
 PackManager      <- class C: manifest, version, download, verify, evict
 SyncTransport    <- class A (and later B) movement: folder | Dexie Cloud
 CrowdClient      <- class D: consent gate, outbox, signed ranking file
```

### 5.1 StorageRegistry

A single typed module (`src/storage/registry.ts`) generalising `syncedTables.ts`. Every Dexie table, blob namespace and pack id is declared once:

```ts
type DataClass = 'A' | 'B' | 'C' | 'D' | 'L';
interface StoreSpec {
  id: string;                 // 'vocabulary', 'blob:book', 'pack:alsihah'
  cls: DataClass;
  syncs: boolean;             // moves between devices
  inBackup: boolean;
  evictable: boolean;         // may be freed automatically under pressure
  merge?: 'frontier' | 'union-by-id' | 'none';
  exportFormat: 'json' | 'original-file' | 'none';
}
```

A test fails if a Dexie table or blob namespace exists that is not in the registry. That is the enforcement for "new features must say which class their data is" (ADR 0003). The Storage screen (section 9) and full export are generated from it, so they cannot drift.

### 5.2 BlobStore

Content-addressed bytes. The hash is SHA-256, lowercase hex, computed over the raw bytes.

```ts
interface BlobStore {
  put(data: Blob | Uint8Array, opts: { ns: string; type?: string }): Promise<BlobRef>; // idempotent
  get(hash: string): Promise<Blob | undefined>;
  has(hash: string): Promise<boolean>;
  delete(hash: string, ns: string): Promise<void>;   // drops the ns reference; bytes go when none remain
  list(ns?: string): AsyncIterable<BlobRef>;
  usage(): Promise<{ [ns: string]: { count: number; bytes: number } }>;
  pin(hash: string, owner: string): Promise<void>;   // owner = book id, pack id, etc.
  unpin(hash: string, owner: string): Promise<void>;
}
interface BlobRef { hash: string; size: number; type: string; ns: string; addedAt: number }
```

- **Reference counting through owners.** A blob is deleted only when no owner pins it. Two books with identical bytes share one blob, and deleting one book never breaks the other. This is what removes the duplicate-book bugs at the root.
- **Hash verify on read is optional, on write mandatory.** Reads of large blobs do not re-hash (cost); a `verify(hash)` call exists for the export and repair paths.
- **Backends behind one interface:** `IdbBlobStore` (all platforms, M1 baseline), `OpfsBlobStore` (web, after the iOS device test), `FsBlobStore` (Electron, under the user-data folder in a two-level hash directory), `CapacitorBlobStore` (mobile documents directory, not WebView storage). The metadata index (ref, size, owners) is a Dexie table `blobIndex` on every backend, class L (rebuildable by scanning the backend).
- **Streaming:** `put` accepts a Blob so the browser can stream; the hashing runs in a worker for files over 8 MB so the reader UI is not blocked.

### 5.3 PackManager

```ts
interface PackManager {
  available(): Promise<PackInfo[]>;                  // from the cached manifest, works offline
  refresh(): Promise<void>;                          // fetch + verify manifest; network only
  install(id: string, opts?: { signal: AbortSignal; onProgress }): Promise<void>;
  uninstall(id: string): Promise<void>;
  status(id: string): 'absent' | 'downloading' | 'ready' | 'update-available' | 'failed';
  open(id: string): Promise<PackHandle>;             // resolves file names to BlobStore blobs
}
```

**Manifest** (`manifest.json`, one per host, URL configurable in Settings for mirrors and self-hosting):

```json
{ "formatVersion": 1, "generatedAt": "...", "minAppVersion": "0.30.0",
  "packs": [{ "id": "alsihah", "version": 3, "title": "...", "size": 6800000,
              "files": [{ "name": "index.json", "hash": "<sha256>", "size": 123 }],
              "licence": { "spdx": "...", "source": "...", "attribution": "..." } }],
  "signature": "<base64>" }
```

- **Signing:** ECDSA P-256 over the canonical manifest JSON, verified with WebCrypto (available on every target, unlike Ed25519). The public key is compiled into the app; a second "next" key is allowed so rotation does not need an app update. A manifest that fails verification is ignored and the last good one stays in use.
- **Immutable, hash-named files** on the host (`/p/<hash>`), so the CDN caches forever and a resumed download can never mix versions.
- **Resumable:** files over 4 MB are fetched in ranged chunks; progress is persisted so a killed app resumes.
- **Install is atomic:** blobs are written and verified, then a single `packs` row (class L, but treated as authoritative for what is installed) flips to the new version. The old version stays until the new one is verified, then its pins are released.
- **Licence gate:** a pack without a recorded licence is refused by the manifest builder, not by the app (governance gate).
- **Offline:** nothing here is required to read. `install` fails soft with a "not available offline" state.
- **Bundled starter pack:** the app still ships a minimal set so a first run with no network works (decision D4).

### 5.4 SyncTransport

Exists in shape (`src/sync/transport.ts`); folder sync is implemented. Dexie Cloud and any future server implement the same interface and the same batch format, so the merge engine is shared. For class B, folder sync later writes `blobs/<hash>` files next to the event logs; a device that is missing a hash referenced by `books.fileHash` offers "fetch from synced folder" before "re-import this book".

### 5.5 CrowdClient

As in the crowd spec: consent gate, local outbox, signed ranking file, kill switch. Its only coupling to this document is that its tables are class D and are listed in the registry as `syncs: false`.

### 5.6 Identity

Random device id and install id now. No accounts. If accounts ever arrive (Dexie Cloud needs one), that is a new ADR.

## 6. Book files onto the BlobStore (the first migration)

The next schema version (v13: v11 and v12 are already used by sense picks and the crowd tables), with the same safeguards as v10 (verified pre-migration backup first):

1. Add `fileHash?: string` to `books` (a class A field, so it syncs; it is a reference, not content).
2. **Lazy, per-book, resumable migration after upgrade**, not inside the Dexie upgrade transaction (hashing large blobs there would hold the transaction and can time out):
   - read `bookFiles[bookId]`, `put` into BlobStore, `pin(hash, bookId)`, verify `has(hash)` and size, write `books.fileHash` through the write layer, only then delete the `bookFiles` row.
   - Any failure leaves the old row in place; the reader falls back to `bookFiles` while `fileHash` is absent. The migration can be re-run safely.
3. **Import** hashes the file first; if the hash already exists in the library the user is told "already in your library" and nothing is duplicated.
4. **Cross-device:** because `fileHash` syncs, a device that receives a book-list entry sees its hash, and an identical file already present locally (imported separately) attaches to it with no re-import.
5. **Delete book:** unpin; the BlobStore frees the bytes when no other owner remains.
6. Rollback: v13 keeps the `bookFiles` store declared (empty after migration) for one release so a downgrade does not corrupt; the pre-migration backup is the real safety net.

## 7. Cloud architecture (optional, not required to run)

Provider: Cloudflare ([ADR 0005](../adr/0005-cloudflare-hosting.md), accepted). Pack hosting format: [ADR 0007](../adr/0007-static-pack-hosting.md) (proposed). Summary:

- **Static packs:** Cloudflare R2 behind its CDN, custom domain, CORS limited to the app's origins (`scripts/shamela-host/cors.json` is the start). Immutable, hash-named objects plus one signed `manifest.json` with a short cache time.
- **Crowd service:** a Worker plus D1 for ingest and for building the signed ranking file on a schedule. Built after packs, on the same account.
- **Sync server:** none. Folder sync is serverless; Dexie Cloud is a hosted third party. An own server only if both prove insufficient.
- **Environments:** local emulator, staging bucket, production, each feature behind a remote kill-switch flag in the manifest (a pack or the crowd client can be disabled without an app release).
- **Operational:** a spending cap and alert at a threshold agreed in the ADR, bucket versioning, vote-store backup, the signing key held offline (not in the repo, not in CI secrets for the app repo) with a documented rotation, logs that hold no more than the privacy text promises.

## 8. Plug-in and extension readiness

A plug-in later gets: read access to class A through the repos, its own namespaced storage (class E, local only, quota-limited, in the registry as `plugin:<id>`), the BlobStore for its files under its own `ns`, and PackManager for its data packs. It never gets raw Dexie or network access without declared permissions. Reserving the `plugin:` registry prefix and the BlobStore `ns` field now avoids a breaking change later. No API is built in M1.

## 9. Local architecture rules

1. IndexedDB for records, a blob store for bytes. Never put large files in Dexie rows.
2. One schema version number, one migration path, verified backup first (built in v10).
3. Every store declares its class, sync rule and eviction rule in the StorageRegistry.
4. Everything works offline. Network features degrade to "not available", never to errors in reading.
5. Storage use is visible to the reader by class, with per-class cleanup. Class L and C are always safely rebuildable or re-downloadable and are evicted first.
6. Full export in open formats (JSON for A, original files for B) is always available. This is the answer to lock-in.
7. On web, request `navigator.storage.persist()` and never claim data cannot be evicted (as in storage-and-sync section 4).

## 10. Decisions on the former open questions

| # | Question | Decision | Why / how to revisit |
|---|---|---|---|
| D1 | OPFS or IndexedDB for web blobs | **IdbBlobStore is the baseline; OPFS is added later behind the same interface.** | IndexedDB works on every target, `bookFiles` already lives there, and OPFS gains little on iOS where both share one eviction policy. Revisit with a measured test on a real iPhone (large PDF write, eviction after 7 days). |
| D2 | Does class B sync through us | **No (maintainer, 2026-10-06).** Only through the reader's own sync folder, later, as `blobs/<hash>` files. Never through our servers or a third-party sync service. | ADR 0002: our servers never hold records or files. |
| D3 | iOS quota and eviction | Persist request, visible usage, evict L then C, backup reminder, native app (Capacitor) uses the documents directory which is not subject to WebView eviction. | The web build on iOS is the weak case; the message to the reader says so plainly. |
| D4 | What stays bundled | A starter set: one dictionary and the frequency list basics, enough to read a first book offline. Everything else becomes a pack. | Preserves first-run offline; shrinks installers. Size budget to be set when the proof pack lands. |
| D5 | Self-hosting packs | The manifest URL is a setting and the manifest and file layout are documented; running your own host is supported but not packaged. | Cheap to allow, no support promise. |
| D6 | Manifest signature scheme | ECDSA P-256 with WebCrypto, two accepted keys for rotation. | Widest platform support. |

## 11. Privacy, licence and security

- Class B never leaves the device except through the reader's own sync folder. Class A leaves only through the reader's sync folder or, if the reader chooses it, an opt-in third-party sync service (Dexie Cloud, ADR 0002). Nothing in this layer uploads user content.
- Network calls in this layer are: manifest fetch and pack download (GET of public files, no identifiers, no cookies, no custom headers) and the crowd service (opt-in, separate spec).
- Every pack carries a recorded licence and attribution, enforced at manifest build time (governance gate).
- All downloaded bytes are hash-verified before use; manifests are signature-verified.
- The pack host is a third-party processor of request metadata only (IP and file requested); the privacy text must say so when packs ship.

## 12. Milestone M1: data foundation

Scope, in build order, each one a shippable step:

| Step | Deliverable | Done when |
|---|---|---|
| M1a | StorageRegistry plus the "every table is declared" test | Registry covers every current Dexie table; test fails on an undeclared one. |
| M1b | BlobStore (`IdbBlobStore`, `blobIndex`), hashing worker | Property tests: put/get round trip, idempotent put, owner counting, delete frees only at zero owners, crash between write and index is repaired by a scan. |
| M1c | Schema v13 and the book-file migration | Existing library migrates with no loss; migration is resumable after a kill mid-way; duplicate import is detected; backup-first abort still works. |
| M1d | Fonts and personal dictionaries onto BlobStore | Same reads, same UI, old stores empty and removed after one release. |
| M1e | Infrastructure ADR accepted and a staging R2 bucket with the manifest tooling | `scripts/shamela-host` produces a signed manifest; hashes verified by a test. |
| M1f | PackManager and one dictionary pack as proof | The dictionary downloads, verifies, works offline from cache, updates without losing the old version until verified, evicts and re-installs. |

| M1g | Dexie Cloud: its own ADR (terms, pricing, region, sign-in, licence), then the transport | ADR accepted by the maintainer; two devices sync class A through an account; only one sync method active at a time. |
| M1h | Storage screen and full export (`storage-ux`) | Usage by class from the StorageRegistry and BlobStore; export everything and re-import into an empty profile. |

Later (not M1): Shamela on packs, crowd service deployed.

## 13. Test plan

- **BlobStore:** the property tests in M1b, run against every backend through one shared suite; a fake-quota backend for the "storage full" path (a failed put must leave nothing half-indexed).
- **Migration:** fixtures of a v10 database with several books, including duplicates and one corrupt blob; kill the process at each step; verify no book becomes unreadable.
- **PackManager:** a local static server with a tampered file, a truncated download, a bad signature, a manifest rollback to an older version, and an offline start; each must fail safe.
- **Registry:** the undeclared-store test, plus an export test that every `exportFormat !== 'none'` store appears in the export.
- **Device:** one iPhone and one Android run of the OPFS-versus-IDB measurement before D1 is revisited.

## 14. Rollout and kill switch

Everything is local until M1e. Pack downloads can be disabled remotely through a flag in the signed manifest and locally in Settings ("Don't download packs"), in which case only bundled data is used. The BlobStore migration is per-book and can be paused; the old `bookFiles` path remains for one release.

## 15. Remaining open questions

- Starter-pack size budget (D4) and which dictionary is the proof pack.
- Spending cap amount and alert threshold (ADR 0005 and 0007).
- Whether Electron should keep blobs in the user-data folder or let the reader choose a location (matters for large audio).
- Self-hosting documentation scope (D5) once packs exist.
