# Data architecture: local and cloud

Status: draft (2026-10-06); ADRs 0002 (revised), 0003 and 0005 accepted 2026-10-06. Umbrella spec: it names the layers and the rules between them. Each layer gets its own detailed spec when built.
Roadmap nodes: data-arch-spec, blob-store, pack-manager, dexie-cloud, infra-cloud.
Related: [storage-and-sync.md](storage-and-sync.md) (layer A, built), [crowd-sense-ranking.md](crowd-sense-ranking.md) (layer D), [ADR 0002](../adr/0002-local-first-backend-exception.md), [ADR 0003](../adr/0003-four-data-classes.md).

## 1. Why this exists

Today the app has one well-built layer (user data in IndexedDB with sync) and several ad hoc ones (book files, dictionaries, Shamela, fonts). Planned work adds PDFs, audio, video, a poetry corpus, hosted books, crowd data and plug-ins. Without a shared model each feature invents its own storage, its own download logic and its own privacy story. This spec fixes the model once so features plug in.

## 2. The four data classes

Every piece of data belongs to exactly one class. The class decides where it lives, whether it syncs, and whether it can leave the device.

| Class | Examples | Size | Owner | Local home | Cloud home | Syncs between devices |
|---|---|---|---|---|---|---|
| **A. User records** | vocabulary, FSRS state, highlights, notes, bookmarks, positions, preferences, book list | small, many rows | the reader | Dexie (IndexedDB), through the write layer | none by default; optional sync transport | Yes, merged row by row |
| **B. User files** | imported books, PDFs, audio, uploaded fonts, user dictionaries | large, immutable | the reader | blob store | only the reader's own sync folder; never our servers (decided 2026-10-06) | Optional, by content hash, through the sync folder |
| **C. Reference packs** | dictionaries, Shamela books, poetry corpus, frequency lists, Anki templates | large, public, versioned | us | blob store, cache | static host (R2 or similar) | No, each device downloads its own |
| **D. Aggregate data** | crowd votes up, rankings down | tiny up, medium down | us | outbox queue and a signed ranking file | ingest API plus ranking file | No, never merged into A |

Rules between classes:
- A never contains B or C content, only references (a content hash or a pack id and version).
- D never touches A's sync tables (already required by the crowd spec).
- Only A and B belong to the reader. C and D are ours and replaceable.

## 3. Layers and interfaces

```
 UI and features
      |
 Repos (vocabularyRepo, booksRepo ...)  <- only way features touch class A
      |
 Write layer (writeLayer.ts)            <- updatedAt, outbox capture, atomic
      |
 Dexie schema vN + migration gate       <- backup before every upgrade

 BlobStore      <- class B and C bytes, addressed by content hash
 PackManager    <- class C: manifest, version, download, verify, evict
 SyncTransport  <- class A and B movement: folder | Dexie Cloud | future own server
 CrowdClient    <- class D: consent gate, outbox, signed ranking file
```

Interfaces to define (names are the contract, signatures come in each layer's spec):
- **BlobStore**: `put(bytes) -> hash`, `get(hash)`, `has(hash)`, `delete(hash)`, `list()`, `usage()`. Backends: IndexedDB or OPFS (web), filesystem (Electron), Capacitor filesystem (mobile). Content addressing gives free de-duplication, which also fixes duplicate-book bugs at the root.
- **PackManager**: reads a signed `manifest.json` (id, version, size, hash, licence, min app version), downloads in resumable chunks, verifies the hash before use, keeps old versions until the new one is verified, and can evict by least recently used. Works offline from cache. The manifest URL is configurable so self-hosting or a mirror is possible.
- **SyncTransport**: already exists in shape (`src/sync/transport.ts`). Folder sync is implemented. Dexie Cloud and any future server implement the same interface and the same batch format, so the merge engine is shared.
- **Identity**: random device id and install id now. No accounts. If accounts ever arrive (Dexie Cloud needs one for its option), that is a new ADR.

## 4. Local architecture rules

1. IndexedDB for records, a blob store for bytes. Never put large files in Dexie rows.
2. One schema version number, one migration path, verified backup first (built in v10).
3. Every table declares its class, whether it syncs, and its merge rule in one registry (`syncedTables.ts` is the start).
4. Everything works offline. Network features degrade to "not available", never to errors in reading.
5. Storage quota is visible to the reader (usage by class) with per-class cleanup. Class C is always safely re-downloadable, so it is evicted first.
6. Full export in open formats (JSON for A, original files for B) is always available. This is the answer to lock-in.

## 5. Cloud architecture (optional, not required to run)

Per ADR 0002 the backend is narrow and the app works without it. Hosting provider: Cloudflare ([ADR 0005](../adr/0005-cloudflare-hosting.md), accepted 2026-10-06).
- **Static packs**: object storage with CORS and a CDN (Cloudflare R2). Immutable, hash-named files. Cheap and cacheable. Used by Shamela hosting, poetry, audio and dictionaries.
- **Crowd service**: a small serverless function plus a database (Worker plus D1) for ingest and for building the signed ranking file on a schedule.
- **Sync server**: none for now. Folder sync is serverless; Dexie Cloud is a hosted third party. Own server only if both prove insufficient.
- **Environments**: local emulator, staging, production, with a kill-switch flag per feature.
- **Operational**: cost cap and alerts, backups of the vote store, signing key stored off the repo with a rotation plan, logs without addresses beyond what the privacy text promises.

## 6. Plug-in and extension readiness

A plug-in later gets: read access to class A through the repos, its own namespaced storage (a new class E, local only), the BlobStore for its files, and PackManager for its data packs. It never gets raw Dexie or network access without declared permissions. Reserving the namespace now avoids a breaking change later.

## 7. Build order

1. This spec agreed, plus the infrastructure ADR (hosting choice, cost cap).
2. **BlobStore** and migrate existing book files to it (hash addressing, dedupe).
3. **PackManager** and move one existing pack (a dictionary) onto it as the proof.
4. Shamela hosting on PackManager and the static host.
5. Dexie Cloud transport (spec section 6 of storage-and-sync).
6. Crowd service deployed on the same stack.
7. Storage usage screen and full export.

## 8. Open questions

- OPFS versus IndexedDB for web blobs, given iOS Safari limits and eviction (needs a test on a device).
- ~~Whether class B ever syncs through us.~~ **Decided 2026-10-06 (maintainer): never.** The reader's own files (books, audio, video) sync only through the reader's own sync folder, by content hash. They are never stored on our servers.
- Quota policy on iOS, where the system can evict web storage.
- Self-hosting: do we document running your own pack host and ranking service?
