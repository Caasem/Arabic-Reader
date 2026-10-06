# Crowd data: shared meanings and vocabulary statistics

Roadmap id: `crowd-ranking` · Area: Content and data · Status: built and tested, not deployed (v0.31-0.33, in PR Caasem/Arabic-Reader#13) · Depends on: `infra-cloud` (deployment), `sync-v10` · Enables: `community`, optional signal for `book-readiness`

## 1. Purpose

A word often shows many dictionary entries. When readers save a word from the popup, the entry they choose is a vote for it. Counted across consenting readers, these votes put the most useful entry first. The full design is `docs/specs/crowd-sense-ranking.md`; its section 19 records what is built. This spec states the expected behaviour and the remaining work: deployment, and the reader features the spec lists as not built.

## 2. Expected Behaviour

**Built (dormant until deployed):**
- Saving an entry with its "+", saving a selection, or saving an edited meaning records a pick locally (`sensePicks`). The next time the reader opens that word in the same book, their saved entry comes first (`savedEntriesFirst`, on by default; no visible control).
- Alt+P shows the entries saved from the current book and writes them to a file (phase 0 test).
- Settings → Library & data → **Shared meanings** (off by default): with it on and a service address built in, picks are sent (pseudonymous install key, no text, no history), and signed rankings come back so the entry most readers saved comes first in each dictionary. The reader's own picks still come first for them. **Delete what I shared** removes their votes and rotates the install id; a recovery code allows deletion from another device. 10% of installs are a hold-out that sees dictionary order.
- With sharing off, the app makes no request to the crowd host (except an explicit delete).

**Remaining work in this item:**
1. **Deploy** (with `infra-cloud`): signing key generated and stored as a Worker secret; public key and service address built into the app (`src/crowdSync/publicKeys.ts`); staging first, then production; privacy page (`docs/privacy-shared-meanings.md`) reviewed and published; the README's "nothing you read ever leaves your device" sentence reworded to stay true ("…unless you turn on Shared meanings").
2. **Launch thresholds** checked against expected volume: a ranking applies only when its thresholds are met (spec section 8), so a small user base shows dictionary order. Document the expected time to first ranking.
3. **Optional visual marker** (spec): a thin line beside the top-ranked entry with tooltip "Most readers chose this", behind a setting "Show which meaning readers chose most" (default off). No counts shown, ever.
4. **Vocabulary statistics for the reader's own data** (no network): Dashboard section "Your dictionary choices": which dictionaries the reader saves from most, and how often their pick differs from dictionary order. Purely local.

Explicitly **not** in this item (they are separate roadmap items or future): Apple sign-in in the app, phase 3 signals (lookup rate, co-lookups, "readers also checked", hard-word marks, "before this chapter" from crowd data), editions.

## 3. User Flows

1. Reader turns on Shared meanings → consent screen (what is sent, pseudonymous ID, deletion) → On → saves words as usual → weeks later the order of entries for common words reflects other readers.
2. Reader → Delete what I shared → confirm → votes deleted server-side, new install id.
3. Maintainer → deploy staging → e2e "a save travels to another device" against staging → production.

## 4. UI / UX Behaviour

As built; plus the optional marker and the Dashboard section above. Wording never says "anonymous" (spec principle 3).

## 5. Data & State

Local tables `sensePicks` (v11), `crowdState`, `crowdQueue`, `crowdPacks` (v12), all local only. Server: D1 schema in `crowd-server/schema.sql`; ranking packs in R2.

## 6. Technical Requirements

- Keep every network call behind `crowdFetch` in `src/crowdSync/consent.ts`.
- Kill switches: server flag and remote config `crowd` (`infra-cloud`).
- Do not add the crowd tables to sync.

## 7. Edge Cases & Error Handling

Covered in the crowd spec (sections 11-14): rate limits, invalid packs (rejected, previous kept), rollback, server down (local order only), deletion while offline (queued).

## 8. Acceptance Criteria

- Staging and production deployed by runbook; the app's release build ships the public key and address; e2e passes against staging.
- Privacy page published and linked from the consent screen; README wording updated.
- Optional marker and local statistics behave as specified and are off/local as stated.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Finish roadmap item "crowd-ranking" (Shared meanings): deploy it and add the two small remaining reader features. The design is docs/specs/crowd-sense-ranking.md; section 19 says what is built.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: infra-cloud (docs/features/infra-cloud.md) must exist for deployment. Deployment, key generation and publishing the privacy page are outward-facing: confirm each step with the maintainer.

What exists: src/sensePicks (local picks, rankByPicks), src/crowdSync (consent gate, install key, queue, sender, pack cache, Settings), src/picksExport (Alt+P), crowd-server/ (Worker, D1, R2, cron, admin, tests), docs/privacy-shared-meanings.md (draft).

Do (read docs/features/crowd-ranking.md first):
1. Deployment per the runbook: staging then production, signing key as a Worker secret, public key and address in src/crowdSync/publicKeys.ts for release builds only; e2e against staging.
2. Publish the privacy page; update README wording.
3. Optional marker in the popup behind a default-off setting; never show counts.
4. Local Dashboard section "Your dictionary choices".
5. npm run test:unit, npm run crowd:typecheck, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/crowd-deploy.
```

## 10. Future Extensions

From the crowd spec, phase 3 and 4: lookup-rate statistics, co-lookups ("readers also checked"), hard-word marks, crowd "before this chapter", glossary per book, Apple sign-in and trust tiers, editions, verb-form hints, sentence-context ranking.
