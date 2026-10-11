# Shared cloud hosting

Roadmap id: `infra-cloud` · Area: Foundation · Status: planned · Depends on: `governance`, `data-arch-spec` · Enables: `shamela-host`, `crowd-ranking` (deploy), `pack-manager`, `audiobooks`

## 1. Purpose

Two built features need hosting: Shamela books as static files (`scripts/shamela-host/upload.mjs` targets a Cloudflare R2 bucket `shamela`, with CORS rules in `cors.json`) and the crowd ranking service (`crowd-server/`: a Cloudflare Worker with a D1 database, an R2 bucket for ranking packs and a daily cron, configured in `crowd-server/wrangler.toml`, not deployed). Later, data packs (dictionaries, audio) need the same. The app works fully without any of it (ADR 0002). This item makes one deliberate, documented, cost-capped hosting setup that all of them share.

## 2. Expected Behaviour

Outcome for the maintainer:
- **One Cloudflare account** with: R2 buckets `shamela` (public read via a custom domain or r2.dev, CORS as in `cors.json`), `arabic-reader-packs` (public read, for class C packs), `arabic-reader-crowd-packs` (public read of signed ranking files); D1 database `arabic-reader-crowd`; Worker `arabic-reader-crowd` with its cron.
- **Environments:** `staging` and `production` for the Worker and buckets (separate names with `-staging` suffix), selected by `wrangler --env`. The app build chooses the base URLs per build (`VITE_PACKS_BASE_URL`, `VITE_SHAMELA_BASE_URL`, crowd service address in `src/crowdSync/publicKeys.ts`). Development builds point at staging; release builds at production.
- **Domains:** `packs.<domain>`, `shamela.<domain>`, `crowd.<domain>` (or r2.dev/workers.dev until a domain exists). All HTTPS.
- **Cost guardrails:** stay inside the free tiers (R2: 10 GB stored, 1M class A and 10M class B operations a month; Workers free plan; D1 free limits) with alerts at 80%. The Shamela uploader already enforces a size cap and a write cap.
- **Kill switches:** a `config.json` in the packs bucket (`{ "shamela": true, "packs": true, "crowd": true, "minAppVersion": "0.33.0" }`), fetched by the app at most once a day and cached; any `false` hides that network feature gracefully. The crowd feature also has its own server-side flag.
- **Privacy:** no analytics, no logging of IP addresses beyond what Cloudflare does by default; the privacy page states what the provider can see. Request logs in the Worker never store IPs.
- **Runbook:** `docs/ops/runbook.md` with deploy, rollback, key rotation (crowd signing key), restoring D1 from backup, emptying a bucket, and the monthly cost check. (The crowd branch added a runbook; extend it rather than duplicate.)
- ADR 0005 "Cloudflare as the single hosting provider" records the choice, alternatives (S3 + Lambda, Supabase, Fly.io) and exit plan (everything is static files plus one Worker; moving means re-uploading files and porting one Worker).

## 3. User Flows

(Maintainer.)
1. Create the account and buckets with the script → deploy the Worker to staging → run the crowd e2e against staging → upload a 10-book Shamela sample to staging → app dev build reads it.
2. Promote to production → app release build points at production.
3. Monthly: run the cost check script; read alerts.

## 4. UI / UX Behaviour

App side only: features whose kill switch is off disappear without errors; a feature unreachable (offline, server down) shows its existing "not available" state.

## 5. Data & State

- `config.json` in the packs bucket as above; cached in localStorage with its fetch time.
- Secrets (crowd signing key, Apple sign-in secrets if ever used) only in Wrangler secrets, never in the repo.

## 6. Technical Requirements

- `infra/` folder: `wrangler.toml` environments (or keep `crowd-server/wrangler.toml` and add envs), a `setup.mjs` that creates buckets/D1 idempotently via Wrangler, bucket CORS from JSON files, and `cost-check.mjs` using the Cloudflare API (token in an env var, read-only scope).
- App: a small `src/remoteConfig/` that fetches `config.json` (no cookies, no identifiers in the request), with a 24 h cache and a 5 s timeout; exposes `isEnabled('shamela' | 'packs' | 'crowd')` and `minAppVersion`.
- Content Security Policy: add the three domains to `connect-src` (check `index.html`/Electron CSP).

## 7. Edge Cases & Error Handling

- Config fetch fails: use the cached value; with no cache, treat features as enabled but still handle their own failures.
- Free-tier limit reached: R2 returns errors; the app shows features as unavailable; alert fires.
- Leaked token: rotate via runbook; tokens are scoped minimal.

## 8. Acceptance Criteria

- Staging and production exist and are reproducible from `infra/setup.mjs`.
- Crowd Worker deployed to staging with passing e2e against it; Shamela sample served with correct CORS to the app's origins.
- Remote config works, including kill switch off.
- ADR 0005 and runbook written; cost alerts configured.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "infra-cloud": one Cloudflare setup (R2, D1, Worker) with staging and production, remote kill switches, cost guardrails and a runbook, shared by Shamela hosting, data packs and the crowd service.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists: crowd-server/ (Worker, D1 schema, R2 binding PACKS, cron; wrangler.toml with placeholders; a runbook and privacy draft from the crowd work: find them with a search for "runbook" and docs/privacy-shared-meanings.md); scripts/shamela-host/upload.mjs and cors.json (R2 bucket "shamela", size and write caps); src/crowdSync/publicKeys.ts (service address, empty = dormant). ADR 0002 limits what the backend may do.

Do (read docs/features/infra-cloud.md first):
1. Write ADR 0005 (Cloudflare as single provider, alternatives, exit plan) and ask the maintainer to accept it before creating anything.
2. infra/ with idempotent setup, environments, CORS files, cost-check script. Never commit tokens or secrets.
3. src/remoteConfig/ (config.json with kill switches and minAppVersion, 24 h cache) wired into Shamela, packs and crowd features; CSP connect-src.
4. Deploy crowd Worker to staging only after the maintainer confirms; run its tests against staging.
5. Runbook in docs/ops/runbook.md (extend the crowd runbook).
6. Tests for remoteConfig. npm run test:unit, npm run build; version, CHANGELOG, roadmap status; branch feat/infra-cloud.
Creating cloud resources and deploying are outward-facing: confirm each with the maintainer.
```

## 10. Future Extensions

- A status page for the services.
- Mirrors for regions with poor Cloudflare reach, using PackManager's configurable base URL.
- Documented self-hosting of packs and the crowd service.
