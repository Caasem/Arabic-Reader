# Community layer and website

Roadmap id: `community` · Area: Platform and community · Status: idea · Depends on: `plugin-api`, `crowd-ranking` (deployed)

## 1. Purpose

Once readers can extend the app (plug-ins) and share useful data (glossaries, word lists, Hashiya sheets, clip lessons), they need somewhere to find and publish them, and a way to talk about the app. The question "should the community layer be a website?" is answered here in stages, starting with the cheapest thing that works and adding a real site only when people need to publish and discuss.

## 2. Expected Behaviour

**Stage 1: a registry, no website (first build)**
- A public GitHub repository `Caasem/arabic-reader-registry` holds `registry.json`: a list of plug-ins and shared packs (glossaries, word lists, Hashiya templates), each with id, name, author, description, version, download URL (a GitHub release asset), sha256, licence, permissions (plug-ins), screenshots, and a review status.
- Contributions arrive as pull requests that add or update an entry; the maintainer reviews (checklist: permissions match the code, licence stated, no tracking, no remote code loading) and merges.
- In the app: Settings → Plug-ins → **Browse** lists the registry (fetched once a day, cached; no identifiers sent), with search, categories, and **Install** (downloads, verifies sha256, then the normal permission consent). Same for **Shared lists** under Vocabulary → Import.
- Discussion lives on GitHub Discussions of the main repo (linked from Settings → About → Community).

**Stage 2: a website (only when stage 1 shows demand: for example 20+ registry entries or frequent requests to publish without GitHub)**
- A static website (`arabicreader.<domain>` or GitHub Pages) generated from the registry: listing pages, detail pages with screenshots, install buttons (deep links into the app: `arabicreader://install?id=...` on platforms that support custom schemes; otherwise download links), a getting-started guide, the user documentation, and the privacy page.
- Publishing without GitHub: a simple submission form that creates a pull request through a small serverless function (Cloudflare Worker from `infra-cloud`), with email verification only for the submitter, no accounts for readers.

**Stage 3: community data features (later, separate items)**
- Book-level shared glossaries ranked by crowd data, reading groups, shared Hashiya sheets. Each needs its own spec and privacy review.

## 3. User Flows

1. Reader → Settings → Plug-ins → Browse → "Glossary maker" → Install → consent → panel appears.
2. Author → forks the registry → adds an entry with release asset → PR → maintainer reviews → merged → appears in the app next day.
3. Reader → Settings → About → Community → opens GitHub Discussions.

## 4. UI / UX Behaviour

- Browse lists with icon, name, author, short description, "Reviewed" badge, install count only if the registry publishes it (it does not in stage 1: no telemetry).
- Unavailable offline: "Connect to browse plug-ins. Installed plug-ins work offline."

## 5. Data & State

- `registry.json` schema documented in the registry repo and in `docs/plugins/README.md`.
- App caches the registry (local only) and records installed items via the plug-in tables from `plugin-api`.
- No reader accounts, no telemetry.

## 6. Technical Requirements

- Registry fetch from a raw GitHub URL or the static host (`infra-cloud`), with ETag; validated against a JSON schema; entries failing validation are hidden.
- sha256 verification before install; optionally registry signing (ECDSA P-256, same key handling as packs) in stage 2.
- Website (stage 2): a static-site generator (Astro or Eleventy, MIT) in a separate repo or `website/` folder, deployed by GitHub Actions to Pages; Arabic and English pages; RTL.

## 7. Edge Cases & Error Handling

- Registry entry points to a missing or changed file (hash mismatch): install refused, "This item could not be verified."
- Malicious plug-in reported: maintainer marks it `revoked` in the registry; the app disables installed copies with a notice on next registry fetch.
- GitHub unreachable: cached registry used.

## 8. Acceptance Criteria

- Stage 1: registry repo with schema, contribution guide and review checklist; app Browse/Install for plug-ins and shared lists with verification; revocation works.
- Stage 2 only after the maintainer decides demand exists (record the decision in an ADR): website live with listings and docs.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "community", stage 1 only: a GitHub-hosted registry of plug-ins and shared lists, and Browse/Install in the app. Do not build a website unless the maintainer explicitly asks for stage 2.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: plugin-api (docs/features/plugin-api.md; src/plugins with install/consent) must exist. crowd-ranking is not needed for stage 1.

Do (read docs/features/community.md first):
1. Draft the registry repository contents (registry.json schema, README, CONTRIBUTING with the review checklist, a GitHub Action validating PRs against the schema) in a folder registry-template/ in this repo; creating the actual public repository is outward-facing: ask the maintainer to create it.
2. App: registry fetch with ETag and schema validation, cached; Browse UI for plug-ins and shared lists; install with sha256 verification then the plug-in consent flow; revocation handling.
3. Settings → About → Community links.
4. Tests: schema validation, verification failures, revocation. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/community-registry.
```

## 10. Future Extensions

- Stage 2 website and submission form.
- Shared glossaries per book, ranked with crowd data.
- Reading groups with shared Hashiya sheets.
- Translations of the app's interface contributed through the registry.
