# Converting a feature to the registry

Refactor phase 5. `src/features/registry.ts` lists every feature once, in order. `ReaderSwitch` mounts their `Host`s,
`App` mounts their `AppHost`s, and `SettingsPanel` places their `SettingsSection`s, all by looping over that list.
A feature not converted yet is an **inline entry** in `FEATURES` (written out in `registry.ts`, with
`touchPoints: []`). Converting it moves that entry into the feature's own `index.ts`, so the feature's folder plus
one registry line is all the app needs.

Worked examples: `c4ff549` (noteCard) and `c87b822` (annotate). Copy their shape.

## Checklist, one feature per commit

1. **Find the inline entry** for the feature in `src/features/registry.ts`, and note its fields (`Host`,
   `SettingsSection`, `settingsGroup`, `settingsAfter`, `AppHost`). Copy them exactly; don't change values.
2. **Fill in what the inline entry lacks**, by reading the feature's code:
   - `pref`: its `<feature>Enabled` preference, if `src/types/preferences.ts` has one (`grep -n "<id>Enabled"`).
     Leave it out when there is none. The feature keeps checking it itself: the registry doesn't gate anything.
   - `chords`: every `useChordHotkey(...)` in the folder, written `Alt+<letter>`, with `Alt+Shift+<letter>` when the
     call passes `true` as the fourth argument. `'KeyN'` is `Alt+N`. Leave it out when there are none.
   - `touchPoints`: every place outside the folder that knows about the feature, besides the registry. Start from
     the comment at the top of its `index.ts`, then check with
     `grep -rn "<id>/\|from '\.\./<id>'\|<id>Enabled" src --include=*.ts --include=*.tsx | grep -v "^src/<id>/"`.
     Drop "mounted in ReaderSwitch" and "in SettingsPanel": the registry covers those now. One short string each,
     naming the file.
3. **Rewrite `src/<id>/index.ts`**:
   - Header comment: what the feature is (keep the existing first sentence or two), then "The app wires it through
     `<id>Feature` in src/features/registry.ts; the other touch points are listed in it. To remove the feature,
     delete this folder, its registry line and those touch points."
   - `import type { FeatureDescriptor } from '../features/registry';`, then import the Host, Settings and AppHost
     components from their own files (not from `./index`).
   - `export const <id>Feature: FeatureDescriptor = { id, pref, Host, AppHost, SettingsSection, settingsGroup,
     settingsAfter, chords, touchPoints };` with only the fields it has.
   - Keep every other export the rest of the app uses (check with grep before removing one). Stop exporting the
     Host and Settings components only if nothing outside the folder imports them through the index any more.
4. **Replace the inline entry** in `registry.ts` with `<id>Feature,` **at the same position**, and change the
   import at the top to `import { <id>Feature } from '../<id>';`. Remove imports that are now unused.
5. **Direct `localStorage` calls**, if the folder has any (see the list below): route them through
   `src/utils/storage.ts` (`readString`, `writeString`, `removeKey`, `readJSON`, `writeJSON`; they never throw, so
   drop the `try/catch` that only guarded storage).
   - **Keep every key string exactly as it is**, including odd prefixes. Saved values must read back unchanged.
   - Keep the stored format: a plain string stays a plain string (`readString`), JSON stays JSON (`readJSON`).
     Don't wrap or rename.
   - Add a test per key family (`src/<id>/<topic>.test.ts`, `// @vitest-environment jsdom`), as in
     `noteCard/color.test.ts` and `annotate/sheetTabs.test.ts`: a value written the old way
     (`localStorage.setItem` with the literal key) reads back through the new code; a write lands under the same
     key in the same format; a missing or broken value falls back as before.
   - If a key lives in a component, move the read/write into a small module beside it (as `noteCard/color.ts`), so
     the test doesn't render the component.
6. **Check:** `npx tsc -b --noEmit`, `npx vitest run src/features src/<id>`. `registry.test.ts` pins the order
   of hosts, app hosts and settings sections, and checks every `pref` exists and no two features share a chord:
   **it must pass unchanged**. Don't edit its expected lists to make it pass; a failure means the entry moved or a
   field changed.
7. **Commit**: `Registry: convert <id>`, saying what the descriptor holds and which storage keys moved (with the
   test), ending with the Co-Authored-By line.

## Features still inline (phase 5 step 3)

In registry order: dictionarySearch, bookSearch, bookVocab, flashCard, picksExport, studyDesk, verbForms, popupClean,
wasitMatch, wasitStructure, look, readerFont, crowdSync.

## Feature files that still call `localStorage` directly

| File | Feature | Notes |
|---|---|---|
| `src/anki/deletions.ts` | anki (not a registry feature: no `index.ts`) | Storage move only |
| `src/browseLibrary/download.ts` | browseLibrary (not a registry feature) | Storage move only |
| `src/dictionaryPage/DictionaryPage.tsx` | dictionaryPage (not a registry feature) | Storage move only |
| `src/dictionarySearch/Shell.tsx` | dictionarySearch | Do it in that feature's commit |
| `src/floatingCard/FloatingCard.tsx` | floatingCard (shared by noteCard and flashCard) | Storage move only |
| `src/studyDesk/DeskDocument.tsx`, `DeskHost.tsx`, `PullInBody.tsx`, `pdfSnap.ts`, `useDesk.ts` | studyDesk | Do them in that feature's commit, or one commit just after it |

Storage-only moves for folders that aren't registry features get their own commit each:
`<folder>: storage through utils/storage`.

Out of scope (core code, not features): `components/dashboard/CollapsibleSection.tsx`, `diagnostics/diagnosticsLog.ts`,
`pdf/ocr/index.ts`, `pomodoro/pomodoroService.ts`, `state/PreferencesProvider.tsx`.

## Done when

- `FEATURES` in `registry.ts` has no inline entries: every line is a `<id>Feature` import.
- `grep -rln "\blocalStorage\b" src --include=*.ts --include=*.tsx | grep -v "\.test\.\|utils/storage.ts"` lists only
  the out-of-scope core files above.
- `npx tsc -b --noEmit`, `npm run lint`, `npm run test:unit` pass, and `npm test` (e2e) passes.
