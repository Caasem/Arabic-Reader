# PackManager: versioned downloadable data packs

Roadmap id: `pack-manager` · Area: Foundation · Status: planned · Depends on: `blob-store`, `infra-cloud` · Enables: `shamela-host`, `audiobooks`, `book-readiness` (frequency packs), `tts` (audio packs)

> **Design authority:** `docs/specs/data-architecture.md` (sections 5-6 and 12) fixes the interfaces and build order for this item. Where this spec and that design differ, the design wins.

## 1. Purpose

Reference data (dictionaries, frequency lists, Shamela books, audio, future corpora) is large, public, versioned and owned by us, not the reader (class C). Today each kind is handled differently: Al-Wasit and others are bundled as lazy JS chunks; AraMorph data is imported by the reader from files; Shamela books are fetched page by page from a third-party proxy; crowd rankings have their own signed manifest (`src/crowdSync`). A single PackManager downloads, verifies, caches, updates and evicts packs the same way, works offline from cache, and lets the bundled app stay small.

## 2. Expected Behaviour

**For the reader**
- Settings → Dictionaries (and wherever data is offered) lists packs with name, size, licence, version and state: **Not downloaded** (with **Download**), **Downloading 45%** (with **Cancel**), **Ready**, **Update available (12 MB)** (with **Update**), **Error** (with **Retry** and the reason).
- Downloads resume after a network drop or app restart. A pack is usable only after it is fully downloaded and verified.
- Updates download in the background when on Wi-Fi (setting "Update data packs automatically on Wi-Fi", default on); the old version stays in use until the new one is verified, then switches at next use.
- Packs can be removed (Settings → Storage) and downloaded again.
- Everything works offline once downloaded.

**For developers**
- `packs.catalog(): Promise<PackInfo[]>` (from the signed catalog, cached), `packs.ensure(id): Promise<PackHandle>` (downloads if needed, returns when ready), `packs.status(id)`, `packs.subscribe(id, listener)`, `packs.remove(id)`, `packs.open(id).file(path): Promise<Blob>` for multi-file packs.
- A pack is described in the **catalog** (the signed manifest: ECDSA P-256 per `docs/specs/data-architecture.md` section 5.3 and ADR 0007; the field list there is authoritative): `{ id, version, title, description, licence, sizeBytes, files: [{ path, bytes, sha256 }], minAppVersion, kind: 'dictionary'|'frequency'|'shamela-book'|'audio'|'other' }`.

## 3. User Flows

1. Settings → Dictionaries → Al-Sihah "Not downloaded · 18 MB" → Download → progress → Ready → appears in lookups.
2. Network drops at 60% → reconnect → resumes from 60%.
3. New version published → "Update available" → auto-updates on Wi-Fi → used after verification.

## 4. UI / UX Behaviour

- A reusable `<PackRow id=…/>` component for any settings screen.
- Errors stated plainly: "Download failed: no connection", "Verification failed: the file was damaged; it will be downloaded again", "Needs a newer app version".

## 5. Data & State

- Bytes in BlobStore (class C, owner `{ kind: 'pack', id }`).
- Local-only table `packs` (id, installedVersion, files → hashes, state, downloadedBytes, lastCheckedAt, error) — schema bump, migration test. Not synced (each device downloads its own).
- Cached signed catalog in localStorage or the table, with its signature.
- Base URL from build config/remote config (`infra-cloud`), overridable in Advanced settings for mirrors or self-hosting.

## 6. Technical Requirements

- Signature verification with Web Crypto ECDSA P-256 (available on every target), as decided in `docs/specs/data-architecture.md` (D6) and ADR 0007. Public keys built into the app; two accepted keys for rotation. Reuse the crowd client's verification code if it fits (`src/crowdSync`).
- Downloads with `fetch` and Range requests for resume; files > 50 MB downloaded in 8 MB ranges, each range appended to a temporary blob; hash verified at the end (streaming SHA-256 for large files, shared with BlobStore).
- Compression: files may be served `.br` or `.gz`; decompress with `DecompressionStream` where supported, else a WASM fallback.
- First migrations onto packs: one existing dictionary as proof (Al-Sihah or Maqayis, currently a bundled chunk), keeping it bundled as fallback until the pack path is proven.
- Requests carry no identifiers and no cookies.

## 7. Edge Cases & Error Handling

- Catalog signature invalid: ignore the new catalog, keep the cached one, log a diagnostic.
- Disk full mid-download: stop, keep partial ranges, show the space needed.
- Pack removed from the catalog: keep the installed copy usable; show "No longer offered".
- `minAppVersion` higher than the app: do not download; show "Needs a newer app version".

## 8. Acceptance Criteria

- One dictionary is served as a pack from staging, downloads, verifies, resumes after interruption, updates atomically, and works offline.
- Tampered file or catalog is rejected (tests).
- PackRow shows every state.
- Unit tests for catalog verification, range resume, atomic switch; e2e with a local static server serving a test pack.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "pack-manager": signed, versioned, resumable downloads of reference data packs into BlobStore, with update and removal.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: blob-store (docs/features/blob-store.md) for storage; infra-cloud (docs/features/infra-cloud.md) for the hosting base URL and remote config. Check both exist; if infra-cloud is missing, develop against a local static server and make the base URL configurable.

What exists: crowd ranking packs with signature checks in src/crowdSync (reuse its verification if suitable); bundled dictionaries as virtual modules (e.g. virtual:alwasit-data in src/dictionary/providers/alwasit); dictionary settings in src/components/shared/settings.

Build (read docs/features/pack-manager.md first):
1. src/packManager/ with manifest fetch + ECDSA P-256 verification (two public keys), ensure/status/subscribe/remove/open, range-resume downloads, decompression, verification, atomic version switch; local-only packs table (schema bump, migration test).
2. <PackRow> component; settings for auto-update on Wi-Fi and base URL override (Advanced).
3. Proof: serve one dictionary as a pack (keep bundled fallback), switch its provider to load from the pack when ready.
4. A script scripts/packs/build-pack.mjs that builds a pack (files, hashes) and a signed catalog (key from an env var, never committed).
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/pack-manager.
```

## 10. Future Extensions

- Delta updates between pack versions.
- Peer-to-peer or LAN sharing of packs between the reader's devices.
- User-contributed packs (with plug-ins), signed by the contributor and reviewed.
