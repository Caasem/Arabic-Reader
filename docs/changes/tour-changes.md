# Tour: change matrix

Follows `docs/features/tour.md`. One section per part that has landed. Everything is on `refactor/integration`; each
row says how to switch it off or take it back out.

## B. Getting started checklist (0.100.0)

A card at the top of the Library with seven things to try. Each ticks itself when it is done. State is saved on the
device only (`arabic-reader:gettingStarted`), no sync.

| Change | Why | Before | After | Files | Off switch / revert |
|---|---|---|---|---|---|
| Checklist logic | Test the rules without a screen | Nothing | Pure `mark`, `count`, `visibility` (card, one closing line, hidden), `seedFromCounts`, `applySeed`, `startOver`, `normalise`; tests | `src/gettingStarted/progress.ts`, `progress.test.ts`, `items.ts` (the seven items as data) | Revert the commit |
| Event emitter | Call sites stay one line | — | `tourEvents.emit('<id>')`, no imports; the store listens from app start, so a reader action counts while the Library is not mounted | `src/gettingStarted/events.ts`, `store.ts`, `store.test.ts` | Revert the commit; an emit with no listener does nothing |
| Ticks | Items tick when the person actually does the thing | — | `save-word` in `saveToVocabulary`; `make-flashcard` in `saveCustomCard` (not sketch-sheet cards); `write-note` when a highlight gets a note (note card or `addHighlight` with a note); `dictionary-search` when Alt+D opens the search; `open-hashiya` on any Alt+M / dock / ring toggle of the margins; `draw-sketch` for an ink stroke, a non-empty sketch sheet saved, or ink on a margin card; `draw-other-source` for the same on a PDF page (`pdf:` key), or ink on a margin card whose source is a different book (pulled in) | `src/vocabulary/vocabularyService.ts`, `src/quietReader/useMarks.ts`, `src/noteCard/NoteCard.tsx`, `src/dictionarySearch/DictionarySearchHost.tsx`, `src/studyDesk/DeskHost.tsx`, `src/annotate/inkStore.ts`, `src/studyDesk/marginInk.tsx` | Delete the one `tourEvents.emit` line in a file |
| Seeding | A long-time user is not shown an empty list | — | On the first Library mount: saved words, notes (highlights with text), hand-written cards, any desk item (Ḥāshiya in use), ink or non-empty sketches, and PDF or pulled-in ink are ticked from the databases, once | `src/gettingStarted/seed.ts`, `useGettingStarted.ts`, `progress.ts` | *Start over* in Settings clears it and does not seed again |
| The card | Show the list, quietly | — | A labelled region with a progress ring ("3 of 7 done"), a list of items (real buttons for *Show me*), Collapse and Hide for good; Alt hints only on a desktop device; "You've done the basics" line once when all are done, then it hides | `src/gettingStarted/GettingStartedCard.tsx`, `gettingStarted.css`, `src/components/library/Library.tsx` (mounts it) | Settings → Library → *Getting started checklist* off; or remove the line in `Library.tsx` |
| Show me | Take the person to the right place | — | Opens the "Start here" book (`START_HERE_BOOK_ID`) or else the newest book, and leaves a one-line hint pill (`TourHint`, an App host) for 15 s. `open-hashiya` also turns the margins on. `draw-other-source` leaves a hint only (it needs a PDF, or a card pulled in from another book) | `GettingStartedCard.tsx`, `hint.ts`, `TourHint.tsx`, `src/onboarding/firstRun.ts` (`START_HERE_BOOK_ID`) | Revert the commit |
| Settings | Get it back, or start over | — | *Getting started checklist* in Settings → Library: show/hide, Start over | `src/gettingStarted/GettingStartedSettings.tsx` | Revert the commit |
| Feature registry | House convention | — | `gettingStartedFeature` (App host, Settings section, `touchPoints`); registry test lists it | `src/gettingStarted/index.ts`, `src/features/registry.ts`, `registry.test.ts` | Delete the folder, its registry line and the touch points |

Definition of `draw-other-source`: ink or a sketch sheet made on a PDF page, or ink written on a Ḥāshiya card pulled
in from a different book. Drawing on text of the book you are reading, or on a card from this book, ticks only
`draw-sketch`.

Not done: no spotlight or step-by-step overlay; progress does not sync between devices; the sketch tick fires when a
sheet is saved with something on it, so opening an empty sheet does not tick.
