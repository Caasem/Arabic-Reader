# Video support: watch with tappable subtitles

Roadmap id: `video` · Area: New surfaces · Status: idea; a prototype exists (`prototype/clip-lesson-watcher`) · Depends on: `popup-extract`; `blob-store` for local video files

## 1. Purpose

Listening is the other half of reading. Learners watch lectures, khutbas, documentaries and short clips in Arabic. With subtitles that can be tapped like book text, a video becomes a reading-and-listening lesson that feeds the same vocabulary and review.

A standalone prototype exists on branch `prototype/clip-lesson-watcher` (folder `clip-watcher/`, its own Vite app): a "graded watcher" that pre-teaches a clip's words as flashcards, plays the clip, then recaps; tap/hover any transcript word for its meaning with Add-to-vocab. Its lookups are hard-coded (`clip-watcher/src/clips.ts`), clips are hand-entered, and grades are session-only. This item brings video into the app properly.

## 2. Expected Behaviour

**Adding a video**
- Library gets a **Videos** shelf (tab next to Books). **+ Add video** offers:
  1. **Local file** (`.mp4`, `.webm`, `.mkv` where the platform can play it) with an optional subtitle file (`.srt`, `.vtt`, `.ass` text only). Embedded text subtitle tracks in MKV/MP4 are used when the platform exposes them.
  2. **YouTube link**: plays through YouTube's embedded player (YouTube terms apply; the app does not download the video). Subtitles: the reader supplies an `.srt`/`.vtt` file, or uses the caption track the reader downloads themselves; the app does not scrape captions (terms of service). If YouTube's player API exposes caption cues to the page in a permitted way, use them; otherwise require a file.
- Title from the file name or YouTube metadata (oEmbed, no API key).

**Watching**
- Player with the subtitle panel beside it (below on phones): the transcript as a scrolling list of cues, current cue highlighted and auto-scrolled. Also an overlay subtitle line on the video.
- Every Arabic word in the panel and the overlay is tappable (via `createLookupSurface`, source `{ kind: 'video', id, title, timeSec }`). Tapping **pauses** the video (setting "Pause when I look up a word", default on) and opens the popup. Closing the popup resumes if it paused.
- Saved cards record the cue's sentence and the time; in Vocabulary, a card from a video has **Play this moment** (opens the video at `timeSec - 2`).
- Controls: play/pause (Space when no popup is open; with a popup open Space follows `click-space-save`), back 5 s (←), forward 5 s (→), previous/next cue (↑/↓ or A/D), speed 0.5-1.5×, **repeat cue** (R), **loop cue** toggle.
- **Lesson mode** (from the prototype): "Prepare" lists the video's words not yet known (frequency-ranked, like `book-readiness`), lets the reader save or mark known, then "Watch", then "Recap" shows the words met. Optional.
- Position is remembered per video and syncs like book positions.

## 3. User Flows

1. Add local lecture + .srt → watch → tap a word → popup (video paused) → Save → close → resumes.
2. Add a YouTube link + .vtt → lesson mode → prepare 8 words → watch → recap.
3. Vocabulary → card from a video → Play this moment.

## 4. UI / UX Behaviour

- Subtitle panel uses the reading font and size settings.
- Missing subtitles: the panel says "No subtitles. Add an .srt or .vtt file to make words tappable." with an Add button.
- Loading/buffering states from the player; YouTube offline: "This video needs an internet connection."

## 5. Data & State

- New synced table `videos` (id, title, kind: 'file'|'youtube', youtubeId?, contentHash?, durationSec, addedAt, updatedAt) — class A metadata. Video files are class B in BlobStore (not synced; "File not on this device" pattern as books). Subtitle files stored as small blobs or inline text in a local table `videoSubtitles`.
- Positions: reuse `positions` with key `video:<id>` and `cfi` = `t=<seconds>`, or a new synced `videoPositions` table; choose the one that keeps sync merge rules correct (furthest-wins does not suit video; use last-write).
- `VocabularyItem.source = { kind: 'video', id, title, timeSec }` (from `popup-extract`).

## 6. Technical Requirements

- New folder `src/video/`. HTML5 `<video>` for local files; the YouTube IFrame Player API for YouTube.
- Subtitle parsing: SRT, WebVTT, ASS (text and timing only; strip styling). Unit-tested.
- Large local files: stored once in BlobStore; on Electron, consider referencing the original file path instead of copying when the reader chooses "Play from its folder" (setting), since videos are large.
- Port useful parts of `clip-watcher/` (lesson flow, transcript component) into the app; then the prototype branch can be closed. Do not merge the prototype folder as-is.
- Respect YouTube's terms: embedded player only, no downloading, no caption scraping.

## 7. Edge Cases & Error Handling

- Codec unsupported (e.g. HEVC on some browsers): "This video format can't be played here. Try MP4 (H.264)."
- Subtitles out of sync: "Shift subtitles" control (±0.1 s steps), saved per video.
- Subtitle file in Windows-1256: same encoding detection as `formats-simple`.
- Very long videos (3 h+): transcript list virtualised.

## 8. Acceptance Criteria

- Local MP4 + SRT plays with a synced, tappable transcript; lookups pause/resume; saving records time; Play this moment works.
- YouTube embed + VTT works the same, with no download or scraping.
- Positions sync; video metadata syncs; files do not.
- Unit tests for subtitle parsers and cue lookup by time; e2e with a short test video and VTT.

## 9. Development Prompt

```text
You are working in the Arabic Reader repository. Implement roadmap item "video": a Videos shelf where local videos and YouTube embeds play with a tappable Arabic subtitle transcript feeding the vocabulary.

PROJECT CONTEXT (read this first)

- **Repository:** Arabic Reader, `C:\Users\qasim\Videos\Arabic-Reader` (GitHub `Caasem/Arabic-Reader`). One web codebase (React 19, TypeScript, Vite) runs as a website/PWA, in Electron on Windows and Mac (`electron/`), and in Capacitor 8 on Android and iOS (`android/`, `ios/`).
- **Storage:** IndexedDB through Dexie. The schema is in `src/persistence/schema.ts` (version 12 when this was written). User-data writes go through the repos in `src/persistence/` and the write layer (`src/persistence/writeLayer.ts`), which stamps `updatedAt` and records sync events for the tables listed in `src/persistence/syncedTables.ts`. A new table needs a new schema version, a migration test, and an explicit decision: synced or local only.
- **Data classes** (`docs/specs/data-architecture.md`): A user records, B user files, C downloadable reference packs, D aggregate/crowd data. State which class any new data belongs to.
- **Readers:** three readers share one lookup path. The new reader (`src/quietReader`, the default), the epub.js reader (`src/components/reader/Reader.tsx`) and the clean reader (`src/cleanReader`). `src/cleanReader/ReaderSwitch.tsx` picks the reader and mounts reader overlays ("hosts"). A word tap goes through `useWordLookups` (`src/components/reader/hooks/useWordLookups.ts`) and renders `DictionaryPopup` (`src/components/reader/DictionaryPopup.tsx`). Dictionaries are providers behind `dictionaryManager` (`src/dictionary`). Saved words are `VocabularyItem`s (`src/types/vocabulary.ts`) written by `vocabularyService` (`src/vocabulary`), scheduled with FSRS (`ts-fsrs`).
- **Feature convention:** a feature lives in its own folder `src/<feature>/`. Its `index.ts` opens with a comment listing every touch point outside the folder and how to remove the feature. It has a `<feature>Enabled` preference (`src/types/preferences.ts` plus its default), a settings component placed in a group of `src/components/shared/SettingsPanel.tsx`, and, for reader overlays, a `<FeatureHost>` mounted in `ReaderSwitch`. Alt+<key> reader shortcuts use `src/readerChords`.
- **Commands:** `npm run dev`; `npm run test:unit` (Vitest); `npm test` (Playwright e2e; it builds, serves on port 4173 and uses `e2e/.auth/returning-user.json` so onboarding is skipped); `npm run build`; `npm run lint`.
- **Process** (`docs/governance.md`): work on a new branch `feat/<name>` from `main`; one revertable commit per user-visible change; bump `package.json` "version" and the `VERSION` file together and add a `CHANGELOG.md` entry; set this item's `status` in `docs/roadmap/roadmap.json`; nothing leaves the device unless the user opted in; record the licence of any third-party data; never commit licensed content.
- **Freshness:** this spec was written on 2026-10-06. Code may have moved since. Confirm names and paths with a search before relying on them; where the spec and the code disagree, follow the code and say so in your summary.

Dependencies: popup-extract (docs/features/popup-extract.md: src/lookup, createLookupSurface, LookupSource 'video') must exist; blob-store (docs/features/blob-store.md) for local files (if missing, store files in a local Dexie table and note it).

Prior art: branch prototype/clip-lesson-watcher, folder clip-watcher/ (standalone Vite app: App.tsx lesson flow, Transcript.tsx, FlashcardPanel.tsx, clips.ts with hard-coded lookups). Read it with git show; port ideas and components, not the folder.

Build (read docs/features/video.md first):
1. Data: synced videos table, local subtitles, positions (last-write), card source with time.
2. src/video/: library shelf, add flows (file + subtitles, YouTube link + subtitles), player with transcript panel and overlay, keyboard controls, pause-on-lookup, Play this moment, subtitle shift.
3. Lesson mode (prepare/watch/recap) as an option.
4. Subtitle parsers (SRT, VTT, ASS) with encoding detection.
5. Tests per section 8. npm run test:unit, npm test, npm run build; version, CHANGELOG, roadmap status; branch feat/video. Ask the maintainer before closing the prototype branch.
```

## 10. Future Extensions

- Speech recognition to make subtitles for videos without them (on-device Whisper via WASM/WebGPU).
- Dual subtitles (Arabic + translation file).
- Clip lessons shared as packs.
- Shadowing practice with recording.
