# readerCore

What the new reader (`src/quietReader`) and the PDF pages (`src/pdf/pages`) share, plus `ReaderSwitch`, which
picks the reader for a book. Made in refactor phase 1 (`docs/changes/refactor-changes.md`) so that nothing the two
kept readers need lives in `src/cleanReader`, which phase 2b deletes.

| File | What it is | Used by |
|---|---|---|
| `ReaderSwitch.tsx` | Picks the reader for a book and mounts the reader overlays ("hosts") | `App` |
| `NewReaderNotice.tsx`, `newReaderNotice.css` | The one-time "you're in the new reader" notice with Switch back (0.95.0) | `ReaderSwitch` |
| `parseCleanEpub.ts` | An EPUB as clean text: chapters of paragraphs, titles, breaks and notes | new reader, search, PDF text (its types) |
| `chapterHtml.ts`, `chapterHtml.css` | A clean chapter as HTML and as plain text; the title, gap and break styles | new reader, `bookModel` |
| `bookModel.ts` | A book's chapter texts and paragraphs, for search, Words and Levels | new reader, PDF pages (`pdfText.ts` builds one per page) |
| `cleanSearch.ts`, `rootSearch.ts`, `searchState.ts` | Searching the clean text (phrase, any word, word forms, same root) and the drawer's search state | new reader, PDF pages |
| `location.ts` | `clean:chapter:start:end` locations, and mapping an epub position to a chapter | new reader, PDF pages, annotate, study desk, book vocab, flash cards |
| `paint.ts` | Highlights and search matches drawn with the CSS Custom Highlight API | new reader, PDF pages |
| `cleanPosition.ts`, `cleanFocus.ts` | The saved place in a book, and whether Focus is on (localStorage; keys unchanged) | new reader, `readerTools/focus.ts` |
| `elementAsDocument.ts`, `useCleanSavedWords.ts` | Lets the shared tap/hold/hover rules run on text in the page; colours saved words | new reader |

Rules:

- Nothing here imports from `src/quietReader` or `src/cleanReader`. The one exception is `ReaderSwitch`, which
  lazy-loads the readers it chooses between and reads a book's Display -> View choice (`quietReader/readerView`,
  which goes with Original layout in 2b).
- `src/quietReader` and `src/pdf` never import from `src/cleanReader`.
- Some legacy names stay (`clean:` locations, `parseCleanEpub`, `.clean-reader__*` classes, the
  `arabic-reader:cleanFocus` and `arabic-reader:cleanPosition:<book>` keys): renaming them would change stored data or every caller, for no
  change in behaviour.

Left where they are, and why:

- `src/reader/tokenizer`, `src/reader/wordInteraction`, `src/reader/session` are shared more widely (the
  dictionaries, speed reader, vocabulary and book search use the tokenizer) and none of the three goes in 2b.
  They are neither moved nor re-exported from here: a re-export would only add a second path to the same code.
- `quietReader/progress.ts` and `quietReader/textOffsets.ts` are the new reader's (annotate and the study desk use `textOffsets` on its page): PDF pages count whole pages and
  find words through their text layer (`pdf/pages/pdfText.ts`).
- The new reader's chrome that PDF pages borrows (`Chrome`, `BookDrawer`, `MarginLevels`, `DisplaySheet`, `icons`,
  `TimerPopover`, `pomodoroClock`, `useMarks`) stays in `src/quietReader`; it is the new reader's UI, and
  `src/quietReader` stays.
