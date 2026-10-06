# Pronunciation audio (offline text-to-speech)

Roadmap id: `tts` · Area: Reader experience · Status: idea · Depends on: nothing (optional packs via `pack-manager`)

## 1. Purpose

A learner reading unvowelled Arabic often does not know how a word sounds. Hearing the word (and its sentence) fixes the vowels in memory and helps with listening. The app has no audio today.

## 2. Expected Behaviour

- A **speaker button** appears in the dictionary popup header, on vocabulary cards, and on the Review back side. Pressing it speaks the word.
- What is spoken: the **vowelled headword** of the entry the reader is looking at (the dictionary's vocalised form, e.g. كِتابٌ), because unvowelled text gives the speech engine nothing to go on. If no vowelled form exists, the surface form is spoken.
- On the card back and in the edit modal, a second button speaks the **sentence**.
- Press while speaking → stops.
- Settings → Reading → **Pronunciation**: on/off (default on when a usable Arabic voice exists, otherwise hidden behind "No Arabic voice found on this device. How to add one"), voice picker (lists the device's Arabic voices), speed (0.6×, 0.8×, 1.0×; default 0.8×).
- Keyboard: with the popup open, **P** speaks the word (no modifiers, not in an input).
- Everything works offline using the device's speech engine. No audio is sent or fetched.

## 3. User Flows

1. Tap word → popup → speaker → hears كِتاب.
2. Review → reveal → speaker on sentence → hears the sentence.
3. Settings → choose voice "ar-SA Maged" → speed 0.6×.
4. Device with no Arabic voice → setting shows the help link explaining how to install an Arabic voice on Windows, macOS, Android, iOS.

## 4. UI / UX Behaviour

- Speaker icon (outline) next to the popup's existing header buttons; filled while speaking.
- If speaking fails: the icon shows a brief error state and a toast "Could not play audio on this device".
- Help text per platform is static content in the settings component.

## 5. Data & State

- Preferences: `pronunciationEnabled`, `pronunciationVoiceURI` (string | null), `pronunciationRate` (number). Preferences sync, but the voice URI is device-specific: store voice per device (localStorage `pronunciation.voice`) and only rate/enabled in synced preferences.
- No new tables.

## 6. Technical Requirements

- Use the Web Speech API (`speechSynthesis`, `SpeechSynthesisUtterance`, `lang` 'ar' or the voice's lang). Voices load asynchronously (`voiceschanged` event); handle Chrome, Edge, Safari and Electron (Chromium) differences.
- Capacitor: the WebView's `speechSynthesis` is unreliable on Android. Add `@capacitor-community/text-to-speech` (or the maintained equivalent at the time) behind the same small interface: `speak(text, { rate, voice }) / stop() / voices()`. Check its licence (MIT expected) and record it.
- New folder `src/pronunciation/` with that interface, the button component, settings, and the touch-point comment.
- Never speak automatically (no autoplay); only on press.

## 7. Edge Cases & Error Handling

- Voice list empty at first then fills: re-evaluate when `voiceschanged` fires.
- Selected voice uninstalled: fall back to the first Arabic voice and update the setting.
- Long sentence (> 300 chars): speak it anyway; stop button works.
- Two presses on different words: the second stops the first.
- Popup closes while speaking: stop.

## 8. Acceptance Criteria

- Speaker button speaks the vowelled headword on desktop Chrome/Edge, macOS Safari, Electron, Android (plugin) and iOS.
- Voice and speed settings apply; P shortcut works in the popup.
- With no Arabic voice the feature is hidden behind the help text and nothing errors.
- Unit test for "what text to speak" selection; e2e with a stubbed speechSynthesis verifying the text and rate.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "tts": offline pronunciation of words and sentences using the device's speech engine.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

What exists: no audio code. Popup header buttons live in src/components/reader/DictionaryPopup.tsx; cards in the Vocabulary screen (src/components/vocabulary) and src/components/review/Review.tsx; edit modal src/components/reader/VocabularyEditModal.tsx. DictionaryEntry.headword is vocalised when the dictionary has vowels.

Build (read docs/features/tts.md first):
1. src/pronunciation/: interface speak/stop/voices; web implementation on speechSynthesis; Capacitor implementation via a text-to-speech plugin (record its licence in the spec section 6 and the README's notices if the repo keeps them).
2. Speaker buttons: popup header (speaks the shown entry's vocalised headword), vocabulary card, review back (word and sentence), P key in the popup.
3. Settings: enabled, voice (per device, localStorage), rate (synced preference); help text when no Arabic voice exists.
4. Tests: unit for text choice and fallback voice; e2e with a stubbed window.speechSynthesis.
5. Check on a real Android device if available; otherwise state it is untested on Android.
6. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/tts.
```

## 10. Future Extensions

- Recorded human audio packs (Forvo-style or a licensed word-audio set) delivered through `pack-manager`, preferred over synthesis when present.
- Read-aloud for whole paragraphs with word highlighting (overlaps `audiobooks`).
- Audio on Anki cards (attach generated audio as media when exporting).
- Shadowing practice: record yourself and compare.
