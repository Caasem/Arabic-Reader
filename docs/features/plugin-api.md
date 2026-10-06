# Plug-in API (Kindle- and KOReader-style extensions)

Roadmap id: `plugin-api` · Area: Platform and community · Status: idea · Depends on: `popup-extract`; design informed by `web-extension` and `video` (see section 6) · Enables: `hashiya`, `community`, a future poetry plug-in

## 1. Purpose

KOReader shows what a community can build on a reader when it has a plug-in system: dictionaries, statistics, sync services, reading aids, all without the core maintainer writing them. Arabic Reader's feature folders already follow a plug-in-like convention (self-contained folder, a host mounted in `ReaderSwitch`, a settings component, a preference, documented touch points). The plug-in API turns that convention into a supported, sandboxed interface so others (and the maintainer, for experimental features such as Hashiya mode or the poetry encyclopedia) can add features without changing the core.

## 2. Expected Behaviour

**For readers**
- Settings → **Plug-ins**: installed plug-ins (name, author, version, permissions, on/off, remove), and **Install plug-in** from a file (`.arplugin` zip) or from the community registry (`community`) once it exists.
- Installing shows the plug-in's requested **permissions** in plain words and asks for consent: e.g. "Read your vocabulary", "Add words to your vocabulary", "Read the text of the open book", "Add a panel to the reader", "Add a button to the dictionary popup", "Add a dictionary", "Store its own data on this device", "Connect to: api.example.org". Network access is listed per domain. A plug-in without network permission cannot make requests.
- Plug-ins can be turned off instantly; a misbehaving plug-in (throws repeatedly, or slows the UI beyond a budget) is disabled automatically with a notice.
- Plug-ins never run in the dictionary data path unless they register a dictionary provider.

**For plug-in authors**
- A plug-in is a zip with `plugin.json` (id, name, version, author, description, `apiVersion`, permissions, entry points) and JavaScript/CSS assets.
- Entry points (contribution points), each optional:
  - `readerPanel`: a panel in the reader's dock/drawer (title, icon, render into a sandboxed frame).
  - `popupAction`: a button in the dictionary popup header, receiving the current word and lookup result.
  - `dictionaryProvider`: implements `lookup(word)` returning entries (shown as a dictionary in the popup, with the plug-in's name).
  - `command`: a named action with an optional keyboard shortcut (Alt+Shift+<key>; conflicts refused).
  - `settings`: a settings page.
  - `bookImporter`: converts a file type to EPUB (same contract as `formats-simple` converters).
  - `onEvent`: subscribe to events: `wordLookedUp`, `wordSaved`, `pageTurned`, `bookOpened`, `reviewCompleted`.
- API object available inside the plug-in: `ar.vocabulary` (read/add, per permissions), `ar.book` (current book metadata, current chapter text, selection, navigate to location), `ar.lookup` (`openLookup` from `popup-extract`), `ar.storage` (namespaced key-value and blobs, class E from the data architecture), `ar.ui` (toast, confirm), `ar.fetch` (only to permitted domains).
- Versioned API (`apiVersion: 1`), with a written compatibility promise: no breaking change within a major version.

## 3. User Flows

1. Reader downloads `glossary-maker.arplugin` → Settings → Plug-ins → Install from file → sees permissions "Read the text of the open book; Read your vocabulary; Add a panel" → Install → a "Glossary" panel appears in the reader dock.
2. Reader turns the plug-in off → panel disappears; its data stays until removed.
3. Author: writes a plug-in with the template (`npm create arabic-reader-plugin`), runs it in the app with a dev mode ("Load unpacked plug-in from folder" on desktop), packages it.

## 4. UI / UX Behaviour

- Permissions screen at install and in each plug-in's details.
- Plug-in panels and pages render inside sandboxed iframes styled by an injected stylesheet with the app's tokens (fonts, colours, dark mode), so they look native.
- Errors: "<Plug-in> stopped working and was turned off" with Details (stack trace) for authors.

## 5. Data & State

- Local table `plugins` (id, version, manifest, enabled, installedAt, grantedPermissions) and plug-in files in BlobStore (class E, local). Whether the list of installed plug-ins syncs between devices: synced table `pluginInstalls` (id, version, enabled) so other devices offer to install them; files are not synced.
- Plug-in private data: namespaced storage (class E), not synced in version 1.

## 6. Technical Requirements

- **Do not start until** at least `popup-extract` and two features built on it (for example `web-extension` and `video`) exist, so the contribution points reflect real needs. Write an ADR for the API (contribution points, permission model, sandbox, versioning, review) before code; the maintainer approves it.
- Sandbox: each plug-in runs in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) or a Web Worker for non-UI code; communication by `postMessage` with a typed RPC layer that checks permissions on every call. No direct access to the app's DOM, IndexedDB, or `window`.
- Network: plug-ins call `ar.fetch`, which the host performs only for permitted domains; Content Security Policy on plug-in frames blocks direct requests.
- Performance budget: RPC calls rate-limited; a plug-in panel that blocks the main thread is impossible by design (iframe/worker), but long tasks in the worker are measured; event handlers have a 50 ms soft budget logged in dev mode.
- Licence: plug-ins are separate works distributed by their authors; document that the API boundary is the GPL interface question the maintainer needs to decide (ADR).
- Mobile: plug-in install from file works on Android and iOS (files app), and from the registry.

## 7. Edge Cases & Error Handling

- Plug-in requests a permission not declared: refused, logged.
- Two plug-ins claim the same shortcut: second refused, user told.
- Plug-in update adds permissions: re-consent required before the update runs.
- Corrupt package or bad manifest: install refused with the validation error.
- `apiVersion` unsupported: "This plug-in needs a newer version of Arabic Reader."

## 8. Acceptance Criteria

- ADR approved.
- Three sample plug-ins in `plugins/examples/` exercise every contribution point: a reader panel (word count of the chapter), a popup action (copy the word with its root), and a dictionary provider (a tiny custom glossary).
- Permission checks enforced (tests that a plug-in without permission is refused for each API).
- Install from file, enable/disable, remove, update with re-consent work on web, Electron and Android.
- Developer docs `docs/plugins/README.md` with the manifest schema, API reference and the template.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "plugin-api": a sandboxed, permission-based plug-in system with contribution points (reader panel, popup action, dictionary provider, command, settings, book importer, events).

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Preconditions (check; stop and report if not met): popup-extract exists (src/lookup with openLookup); at least two features built on it exist (e.g. web-extension, video) so the API reflects real needs.

Do (read docs/features/plugin-api.md first):
1. Write an ADR: contribution points, permission model, sandbox (iframe/worker + typed RPC), versioning promise, licensing position, review policy for the registry. Ask the maintainer to approve before code.
2. src/plugins/: manifest validation, install/remove/enable, permission consent UI, sandbox host + RPC with per-call permission checks, ar.* API, contribution point hosts in the reader dock, popup header, dictionaryManager, commands, settings, importer pipeline, events.
3. Local plugins table, synced pluginInstalls, class E storage; schema bump and migration test.
4. Three example plug-ins in plugins/examples/; developer docs docs/plugins/README.md; a template.
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/plugin-api.
```

## 10. Future Extensions

- Move existing optional features (Pomodoro, Speed Reader, Hashiya, the poetry encyclopedia viewer) to first-party plug-ins.
- Plug-in signing by authors and verified publishers in the registry.
- Plug-ins that add sync transports.
- A plug-in sandbox playground in the developer docs.
