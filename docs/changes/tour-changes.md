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
| Ticks | Items tick when the person actually does the thing | — | `save-word` in `saveToVocabulary`; `make-flashcard` in `saveCustomCard` (not sketch-sheet cards); `write-note` when a highlight gets a note (note card or `addHighlight` with a note); `dictionary-search` when Alt+D opens the search; `open-hashiya` on any Alt+M / dock / ring toggle of the margins; `draw-sketch` for an ink stroke, a non-empty sketch sheet saved, or ink on a margin card; `draw-other-source` for the same on a PDF page (`pdf:` key) | `src/vocabulary/vocabularyService.ts`, `src/quietReader/useMarks.ts`, `src/noteCard/NoteCard.tsx`, `src/dictionarySearch/DictionarySearchHost.tsx`, `src/studyDesk/DeskHost.tsx`, `src/annotate/inkStore.ts`, `src/studyDesk/marginInk.tsx` | Delete the one `tourEvents.emit` line in a file |
| Seeding | A long-time user is not shown an empty list | — | On the first Library mount: saved words, notes (highlights with text), hand-written cards, any desk item (Ḥāshiya in use), ink or non-empty sketches, and PDF ink are ticked from the databases, once | `src/gettingStarted/seed.ts`, `useGettingStarted.ts`, `progress.ts` | *Start over* in Settings clears it and does not seed again |
| The card | Show the list, quietly | — | A labelled region with a progress ring ("3 of 7 done"), a list of items (real buttons for *Show me*), Collapse and Hide for good; Alt hints only on a desktop device; "You've done the basics" line once when all are done, then it hides | `src/gettingStarted/GettingStartedCard.tsx`, `gettingStarted.css`, `src/components/library/Library.tsx` (mounts it) | Settings → Library → *Getting started checklist* off; or remove the line in `Library.tsx` |
| Show me | Take the person to the right place | — | Opens the "Start here" book (`START_HERE_BOOK_ID`) or else the newest book, and leaves a one-line hint pill (`TourHint`, an App host) for 15 s. `open-hashiya` also turns the margins on. `draw-other-source` leaves a hint only (it needs a PDF) | `GettingStartedCard.tsx`, `hint.ts`, `TourHint.tsx`, `src/onboarding/firstRun.ts` (`START_HERE_BOOK_ID`) | Revert the commit |
| Settings | Get it back, or start over | — | *Getting started checklist* in Settings → Library: show/hide, Start over | `src/gettingStarted/GettingStartedSettings.tsx` | Revert the commit |
| Feature registry | House convention | — | `gettingStartedFeature` (App host, Settings section, `touchPoints`); registry test lists it | `src/gettingStarted/index.ts`, `src/features/registry.ts`, `registry.test.ts` | Delete the folder, its registry line and the touch points |

Definition of `draw-other-source`: ink or a sketch sheet made on a PDF page. Ink on the book text you are reading in the
quiet reader, or on a margin card, ticks only `draw-sketch`. Pulled-in material was left out on purpose: margin ink only
extends a card that already has ink, so a pulled-in card cannot be drawn on from scratch (src/studyDesk/marginInk.tsx).

Not done: no spotlight or step-by-step overlay; progress does not sync between devices; the sketch tick fires when a
sheet is saved with something on it, so opening an empty sheet does not tick.

## D. The "Start here" book (0.101.0)

A five-chapter graded Arabic book, built by a script from plain-text sources and preloaded like the other starter
books. It is ordinary EPUB text: no special reader markup and no reader changes. Ticking is done by the checklist's
events, not by the book.

| Change | Why | Before | After | Files | Off switch / revert |
|---|---|---|---|---|---|
| The book | Learn the app by reading | No tour | *ابدأ من هنا — Start here*, author Arabic Reader, `dc:language ar`: ch.1 السُّوق (Task 1 save a word), ch.2 البَيْت (Task 2 Alt+D), ch.3 العَائِلَة (Task 3 Alt+N note, Task 4 Alt+F flashcard), ch.4 يَوْمٌ طَوِيل (the dock in plain words; Task 5 the Ḥāshiya, Alt+M, margin notes, Alt+X, D; Task 6 Alt+W / Alt+K), ch.5 مَاذَا بَعْدُ؟ (Task 7 draw on a PDF page; Review, Vocabulary, Settings). 6 to 10 story sentences a chapter, fully vowelled; English only inside the task and note paragraphs. Tasks are numbered in the checklist order | `scripts/tour-book/ch1.txt` to `ch5.txt`, `public/start-here.epub` (generated, committed) | Remove the entry from `STARTER_BOOKS`; users can delete the book from the Library |
| Build script | Reproducible, no new dependency | — | `npm run build:tour-book` writes a valid EPUB 3 with jszip (already a dependency): `mimetype` stored first, `container.xml`, OPF, nav and NCX, one XHTML per chapter, minimal CSS (no fonts or colours, so the reader's typography and Night mode apply). Fixed file dates, so a rebuild with the same sources is identical. A paragraph starting with مُهِمَّة or مُلاحَظَة gets `class="task"` (the clean-text reader ignores classes). The English half of a task sits in a left-to-right isolate (U+2066 to U+2069) so its punctuation and Arabic quotes stay in order inside the right-to-left page | `scripts/build-tour-book.mjs`, `package.json` (`build:tour-book`) | Revert the commit |
| Starter entry | Reach every install | Three starter books | `start-here.epub` is the first entry, flag `starterBookAdded:start-here`, fixed id `starter-start-here` (`START_HERE_BOOK_ID`). The shelf lists newest first, so the entry marked `first` is added last and lands first. A removed book does not return | `src/onboarding/firstRun.ts` | Remove the entry |
| Tests | Keep it valid | — | Unzips the file (mimetype first and stored, container, OPF language, title, author, nav); parses it as the reader does (five chapters, 6 to 10 story sentences each, tasks 1 to 7 in order with matching Arabic and Latin numerals); imports it through `libraryService.importEpub` with the fixed id | `src/onboarding/startHere.test.ts` | Revert the commit |
| Show me | One place to learn | Opened the newest book | Prefers *Start here* (see section B) | `src/gettingStarted/GettingStartedCard.tsx` | — |

Checked by hand in the built app (`vite preview`, fresh profile): the book is on the shelf, opens from Show me, renders
right to left, words are tappable and resolve, Save Vocabulary ticks *Save a word*, and the card fits a 390 px screen.
Not done: the last welcome slide's line pointing to the book (the slide is fixed height; left out as asked);
Night mode, phone width inside the book, and the Arabic itself need a proofread by the user.
