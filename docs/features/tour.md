# Tour: Getting started checklist and the "Start here" book

Roadmap area: Onboarding · Status: built on `refactor/integration` · Every change, with how to switch it off:
[docs/changes/tour-changes.md](../changes/tour-changes.md)

## Purpose

First-run Onboarding sets the app up; it does not teach it. Two things teach it afterwards, without a tour overlay:

1. **Getting started** (v0.100.0): a card at the top of the Library with seven things to try, each ticking itself when
   the person actually does it.
2. **Start here** (v0.101.0): a short, fully vowelled Arabic starter book whose tasks match the checklist, so the app is
   learned by reading.

## The checklist

One flat list, a progress ring ("3 of 7 done"). In order (the book numbers its tasks the same way):

| # | Id | What | Ticks when |
|---|---|---|---|
| 1 | `save-word` | Save a word (tap a word, Save) | `vocabularyService.saveToVocabulary` |
| 2 | `dictionary-search` | Search the dictionary (Alt+D) | the Alt+D search opens |
| 3 | `write-note` | Write a note (Alt+N) | a note is saved (note card, or a highlight given a note) |
| 4 | `make-flashcard` | Make a flashcard (Alt+F) | `vocabularyService.saveCustomCard`, not for sketch-sheet cards |
| 5 | `open-hashiya` | Open the Ḥāshiya (Alt+M) | Alt+M, the dock's Ḥāshiya button, or the ring's hide/show toggles the margins |
| 6 | `draw-sketch` | Draw or sketch (Write on, Alt+W; or a sketch sheet, Alt+K) | an ink stroke on a page, a non-empty sketch sheet saved, or ink on a margin card |
| 7 | `draw-other-source` | Draw on something from another source | the same, on a **PDF page** (`pdf:` key), or ink written on a margin card **pulled in from another book** |

Definition of 7: the reader's own book is the source you are reading; "another source" is a PDF page, or material
pulled into the Ḥāshiya from a different book. Show me says so.

## Design

- `src/gettingStarted/`: `items.ts` (the list as data), `progress.ts` (pure: mark, count, visibility, seeding),
  `events.ts` (`tourEvents.emit('<id>')`, no imports, one line at each call site), `store.ts` (module-level, saved on
  this device under `arabic-reader:gettingStarted`, listens from app start), `seed.ts` (counts from the databases),
  `GettingStartedCard.tsx`, `TourHint.tsx` (the pill "Show me" leaves, mounted as an App host), settings section.
- Seeding: on the first Library mount, what the databases prove is ticked, so a long-time user is not shown an empty
  list. Done once (`seeded`); *Start over* clears progress and does not seed again.
- Controls: Collapse, Hide for good, Settings → Library → *Getting started checklist* (show/hide and Start over). When
  all seven are done a closing line shows once, then the card hides. It is in the Library, so never during first-run.
- Show me: `save-word`, `dictionary-search`, `write-note`, `make-flashcard`, `draw-sketch` open the "Start here" book
  (else the newest book); `open-hashiya` does too and turns the margins on; `draw-other-source` leaves a hint only.
  No spotlight engine.
- Touch devices (`deviceProfile` not desktop) get the action without the Alt hint.
