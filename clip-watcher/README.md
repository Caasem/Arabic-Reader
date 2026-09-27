# Clip Watcher (prototype)

Standalone graded-watcher prototype: pre-teach a clip's vocabulary as
flashcards, watch the clip, recap the same flashcards afterward. Deliberately
**not** part of the Arabic Reader app -- its own Vite project, so it can be
built and run independently and integrated later (e.g. the dictionary
lookups in `src/clips.ts` are hardcoded here rather than calling into
Arabic Reader's AraMorph engine, standing in for a real lookup API/props
once wired up).

## Run

```
npm install
npm run dev
```

## Candidate clip sources for more lessons

- https://www.youtube.com/playlist?list=PLneghpC4MZa-51fumXDLR1Qzz1eHyzdxC -- short curated clips of Sheikh Saeed al-Kamali (the source of the one prototype clip in `src/clips.ts`), with usable timed Arabic transcripts via YouTube's own caption track.
- https://www.youtube.com/@elkamali/shorts -- Sheikh Saeed al-Kamali's own Shorts.
- https://www.youtube.com/@Qutofosaimi/shorts -- Sheikh Salih al-'Usaymi's Shorts ("قطوف العصيمي").

## Not built yet

- Real clip ingestion (transcript scraping/ASR + vocab extraction) -- one clip is hand-entered in `src/clips.ts`.
- Persisting review results into an FSRS-scheduled store -- flashcard grades are session-only.
- Any connection to Arabic Reader's dictionary/vocabulary services.
