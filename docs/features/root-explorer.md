# Root and morphology explorer

Roadmap id: `root-explorer` · Area: Reader experience · Status: idea · Depends on: `dict-fullpage`

## 1. Purpose

Arabic vocabulary is organised by root. A learner who meets كاتَبَ benefits from seeing كَتَبَ, كِتاب, مَكتَب, مَكتَبة, كاتِب and the verb forms together, with which ones they already know. The app already has the parts: AraMorph gives a word's root and lemma; `verbFamily` lists the verbs of a root with forms I-X (`src/verbForms`); Al-Wasit, Al-Sihah, Maqayis and the root-article provider are filed by root; the reader's vocabulary records `root` on cards. Nothing brings them together in one place.

The explorer is a **root view inside the full-page dictionary**: everything known about one root, with the reader's own progress on each word.

## 2. Expected Behaviour

- Entry points: (a) in the full-page dictionary, a **Root** tab appears whenever the current word has a root; (b) in the popup, pressing the root (already pressable in the clean layout for verb forms) offers "Explore root" which opens the full page on the Root tab; (c) on a vocabulary card, the root is a link to the Root tab.
- The Root tab shows, for root R (letters shown spaced, e.g. "ك ت ب"):
  1. **Meaning of the root**: the Maqāyīs article's opening (its core meaning statement) if Maqayis is available, otherwise the first sense of the root article. Labelled with the source.
  2. **Verbs**: every verb from `verbFamily` for the root, one row each: citation form, form number (I-X), imperfect vowel for Form I, short English gloss. Ordered by form.
  3. **Nouns and other derived words**: the distinct headwords found under the root in the Arabic dictionaries plus AraMorph lemmas for the root, de-duplicated by normalised spelling, each with a gloss when available. Ordered: lemmas with English glosses first, then the rest by the order they appear in Al-Wasīṭ.
  4. **In your vocabulary**: badges on every row the reader has saved (any card whose `root` is R or whose `lemma`/`surfaceForm` matches the row), showing mastery (new, learning, known, mastered) with the app's existing mastery colours.
  5. **In this book** (only when opened from a book): how many times words from this root occur in the current book, if the book vocabulary index (`src/vocabRarity/bookVocabIndex.ts`) is built.
- Pressing a row looks that word up (switches the full page to the word with its dictionary tabs). Each row has "+" to save it as a card (with the root filled in).
- A **Save root family** button saves every verb and derived word not yet saved, as separate cards, after a confirmation stating the count ("Save 14 words from ك ت ب?").

## 3. User Flows

1. Reading → tap مكتبة → popup → press the root → Explore root → Root tab → see verbs and nouns, 3 already saved → "+" on كاتَبَ → saved.
2. Vocabulary screen → card for استكتب → root link → Root tab.
3. Full page → word with root → Root tab → Save root family → confirm → 11 cards added.

## 4. UI / UX Behaviour

- Sections are collapsible with counts. Verb rows use the existing `VerbFormMark` look.
- Loading: sections fill independently; each has its own skeleton.
- Unknown root (a particle, a foreign word): Root tab not shown.
- Root with weak letters: show the root as AraMorph gives it; lookups use the same weak-letter spellings Al-Wasīṭ uses (`alwasit/lookupKeys.ts`).

## 5. Data & State

- No new tables. Reads `vocabulary` by root (add an index on `root` only if a query by root is slow on 5,000 cards; that would be a schema version bump and a migration test).
- New function in `src/dictionary` (or the provider modules): `rootFamily(root): Promise<{ verbs: VerbFamilyMember[]; derived: { headword: string; gloss?: string; providerId: string }[]; coreMeaning?: { text: string; providerId: string } }>`.
- Root-ordered providers expose their entries for a root (`entriesForRoot?(root)` on the provider interface), since they are filed by root already.

## 6. Technical Requirements

- Lives in the full-page dictionary's folder or `src/rootExplorer/` with the touch-point comment; preference `rootExplorerEnabled`.
- Verbs from `AramorphDictionaryProvider.verbFamily` (already exposed through the worker's `verbFamily` message).
- Must not invent forms: list only what the dictionaries and AraMorph provide.
- Performance: building a family for a common root (ق و ل) must finish under 500 ms on a mid-range phone; cache per root in memory for the session.

## 7. Edge Cases & Error Handling

- Dictionaries disabled: sections built from what is enabled; a note lists the dictionaries that would add more.
- AraMorph data not loaded: verbs section says "Verb list needs the Arabic Dictionary data" with a link to its setting.
- Two roots for one word (ambiguous analysis): show a root chooser at the top.
- Save root family when some saves fail: report "Saved 9 of 11. 2 could not be saved." and leave the rest.

## 8. Acceptance Criteria

- Root tab appears for a word with a root and lists verbs (with forms) and derived words with glosses where available.
- Saved words are badged with their mastery.
- Clicking a row looks it up; "+" saves with the root set.
- Save root family adds only unsaved words and reports counts.
- Unit tests for de-duplication and ordering; e2e for flow 1.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "root-explorer": a Root tab in the full-page dictionary that shows everything known about a word's root, with the reader's saved words marked.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/readerCore/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependency: the full-page dictionary (roadmap item dict-fullpage, spec docs/features/dict-fullpage.md) must exist. If src/dictionaryPage (or equivalent) is missing, stop and say so.

What exists:
- AraMorph analysis gives root and lemma (src/dictionary/providers/aramorph); verbFamily(root) lists verbs with form and imperfect vowel (src/verbForms, AramorphDictionaryProvider.verbFamily).
- Root-filed Arabic dictionaries: alwasit, alsihah, almaqayis, rootArticle (src/dictionary/providers/*), with weak-letter lookup keys in alwasit/lookupKeys.ts.
- VocabularyItem has root, lemma, surfaceForm, mastery (src/types/vocabulary.ts).
- Book word index: src/vocabRarity/bookVocabIndex.ts.

Build (read docs/features/root-explorer.md first):
1. rootFamily(root) combining verbFamily, entriesForRoot on root-filed providers (new optional provider method), and the core meaning from Maqayis/root article. De-duplicate by normalised spelling. Never invent forms.
2. The Root tab with the five sections in the spec, row lookup, "+" saving with root set, and Save root family with confirmation and a result count.
3. Entry points: popup root press → "Explore root"; vocabulary card root link.
4. Preference rootExplorerEnabled and a setting.
5. Unit tests (de-dup, ordering, mastery badges), e2e for opening from the popup and saving one row. npm run test:unit, npm test, npm run build.
6. Version bump, CHANGELOG, roadmap status, branch feat/root-explorer.
```

## 10. Future Extensions

- Pattern (wazn) view: group derived words by pattern (فاعل, مفعول, مفعلة) and teach the patterns.
- Root graph: a small visual of a root's family with known words filled in.
- Root-based review: an FSRS deck per root, or a "root of the day".
- Cross-root links: roots that share two letters and related meanings (Maqayis often notes these).
