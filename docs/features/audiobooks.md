# Audiobooks: listen with the text highlighted

Roadmap id: `audiobooks` · Area: New surfaces · Status: idea · Depends on: `popup-extract`; `pack-manager` for hosted audio; `blob-store` for local audio

## 1. Purpose

Hearing a text while reading it (synchronised read-along) is one of the strongest aids for a learner: it fixes pronunciation, vowels and rhythm, and lets the reader follow speech they could not yet follow by ear alone. Classical texts, Qur'an recitations, hadith collections and modern audiobooks exist as audio; some EPUBs already contain synchronised audio (EPUB 3 Media Overlays).

## 2. Expected Behaviour

**Sources of audio for a book**
1. **EPUB 3 Media Overlays** inside the book: detected on import; the book shows a headphones badge.
2. **Audio files the reader adds** to a book (MP3/M4A/OGG, one per chapter or one long file) with optional **sync data**: an `.srt`/`.vtt`/`.lrc` file per audio file aligning time to text, or a JSON alignment (`[{ start, end, text }]`).
3. **Hosted audio packs** (later, via `pack-manager`) for public-domain recordings with alignment, offered on matching books.
- Without alignment, audio still plays per chapter with the text visible, but nothing is highlighted ("Not synchronised").

**Listening**
- In the new reader (and the epub reader), a **Listen** button in the dock/top bar opens a mini player: play/pause, back/forward 10 s, previous/next sentence, speed 0.6-1.5×, sleep timer.
- With alignment, the current sentence (or word, if the alignment is word-level) is highlighted and the page follows the audio (auto page turn / scroll). Tapping any word: pauses (setting), opens the popup, resumes on close. Tapping a sentence while paused (long-press) seeks the audio there.
- Saved cards record the audio time (`source` per `popup-extract` or a book card with `audioTimeSec`), and Review offers **Play** for that moment.
- Background playback on mobile with lock-screen controls (Media Session API; Capacitor background audio).
- Listening position syncs with the reading position when aligned (both point to the same text location).

## 3. User Flows

1. Import an EPUB 3 with media overlays → Listen → text highlights as it plays → tap a word → popup.
2. Book without audio → Book menu → Add audio → choose 12 MP3 files and 12 VTT files → app matches them to chapters (by order and name; reader can reorder) → Listen.
3. Phone locked → audio continues → lock-screen pause.

## 4. UI / UX Behaviour

- Mini player docked at the bottom of the reader, collapsible.
- Matching screen for added audio: list of chapters with assigned audio files, drag to reorder, "Not synchronised" label where no sync file.
- Errors: unsupported audio format; sync file does not match the text (alignment check below 60% match → warning).

## 5. Data & State

- Audio files: class B in BlobStore, owners `{ kind: 'audio', id }`; not synced (books' audio arrives per device, or from packs).
- Synced table `bookAudio` (bookId, tracks: [{ chapterHref, blobHash, syncKind, durationSec }], updatedAt) so other devices know a book has audio and can show "Add the audio files" or fetch the pack.
- Alignment data (small): local table `audioAlignment` (blobHash → cues), or inside the EPUB for media overlays.

## 6. Technical Requirements

- Media overlay parsing: SMIL files referenced from the OPF (`media-overlay` attribute); map `<par>` text fragment ids to audio clip times.
- Highlighting: the readers render text differently (quiet reader as clean text; epub reader via epub.js iframes). Implement an alignment → text-range mapping per reader; start with the new reader (default), then the epub reader.
- Text matching for SRT/VTT alignment: normalised fuzzy matching of cue text to the chapter text in order (sequence alignment), producing ranges.
- Audio playback with `HTMLAudioElement`; Media Session for lock-screen; on Capacitor, a background-audio capable plugin if WebView audio stops when locked (test on iOS and Android).

## 7. Edge Cases & Error Handling

- One audio file for the whole book: chapters derived from alignment; without alignment, one track.
- Alignment drift: "Shift timing" control per track.
- Mixed languages (English commentary): highlight only matched ranges.
- Large audio (1 GB+): stream from BlobStore; never load whole into memory.

## 8. Acceptance Criteria

- An EPUB 3 sample with media overlays plays with sentence highlighting in the new reader.
- Added MP3 + VTT aligns and highlights with ≥ 90% of cues matched on a test chapter.
- Lookups during playback pause/resume; cards keep audio time; Review can play it.
- Background playback with lock-screen controls on Android and iOS (manual check recorded).
- Unit tests for SMIL parsing and cue-to-text alignment.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "audiobooks": synchronised read-along audio for books (EPUB 3 media overlays, or audio files plus subtitle/alignment files), with lookups during playback.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: popup-extract (src/lookup) for lookups during playback; blob-store for audio files; pack-manager only for hosted audio (not required for this item). Check what exists.

Build (read docs/features/audiobooks.md first):
1. Detection and parsing of EPUB 3 media overlays on import; Add audio flow with chapter matching for files + SRT/VTT/LRC/JSON alignment; alignment-to-text mapping with fuzzy sequence matching.
2. Mini player in the new reader first, then the epub reader: highlight, follow, tap-to-lookup with pause/resume, seek by long-press, speed, sleep timer, Media Session.
3. Data: synced bookAudio, local alignment, audio blobs (class B).
4. Cards record audio time; Review Play button.
5. Tests per section 8; manual background-audio check on devices. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/audiobooks.
```

## 10. Future Extensions

- On-device forced alignment (align any recording to the book text without subtitle files).
- Text-to-speech read-aloud as a fallback "audio" for any book (with `tts`).
- Hosted public-domain recordings as packs.
- Recording the reader's own reading for practice.
