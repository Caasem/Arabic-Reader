# One dock for the reader and PDF pages: change matrix

From the dock options page ([artifact](https://claude.ai/artifact/Jkj2CBoZr2VCR9YG6zcmh2), Option A chosen). Branch `feat/shared-reader-dock`, on top of v0.76.0.

**To reverse:** each phase is one commit. Revert newest first: `git revert <phase 3> <phase 2> <phase 1>`. Phase 3 alone can go (PDF pages keep Display, Timer and Focus); phase 2 needs phase 3 gone first; phase 1 needs both gone. No database changes. Two preferences are added (`dockStyle`, `pdfPageTint`); after a revert they are ignored. Page bookmarks made on PDF pages (`pdf:page=N`) stay in the bookmarks table and list in the Highlights page as before.

## Phase 1: one shared dock, icons by default (0.77.0)

| # | What changed | Before | After | Why | Files | To reverse just this row |
|---|---|---|---|---|---|---|
| 1 | Where the dock lives | `Dock` in `src/quietReader/Chrome.tsx` drew the reader's eight buttons itself, then `DockTools` (FocusHost.tsx) added the desk and ink tools | `ReaderDock` in `src/readerTools/Dock.tsx` draws every tool registered for the reader, in group order, with a line between groups and before Display and Levels | One dock for every reader, so the order is the same everywhere | `src/readerTools/Dock.tsx` (new), `src/quietReader/Chrome.tsx` (`Dock`, `DOCK_ITEMS`, `DockSlot` removed), `src/readerTools/FocusHost.tsx` (`DockTools` removed) | Revert the commit |
| 2 | Reading tools declared once | `DOCK_ITEMS` in Chrome.tsx; QuietReader registered them for the rail only | `READ_TOOLS` and `useReadTools(reader, api)` in `src/readerTools/readTools.tsx`; the reader says which it has and what they do | PDF pages register the same tools and get the same order | `src/readerTools/readTools.tsx` (new), `src/quietReader/QuietReader.tsx` (registration effect → `useReadTools('clean', …)`) | Revert the commit |
| 3 | New tool fields | — | `cluster` (line before it), `noRail` (Focus is not in the rail), `ariaLabel`, `live()` (the timer's countdown) | The dock draws Display/Levels lines, Timer's countdown and Focus from the list | `src/readerTools/tools.ts` | — |
| 4 | Icons dock (default) | Names when the reading area was 860 px or wider, icons below that, and the pill scrolled sideways when it still didn't fit | Icons always; the button under the pointer (or keyboard focus) opens to its name and key; a running timer still shows its countdown | Every tool fits at any width (Option A) | `src/readerTools/Dock.tsx`, `src/quietReader/quietReader.css` (`.qr-dock--icons`, `.qr-dock__name`, `.qr-dock__live`) | Set Settings → Reader → Dock to Names |
| 5 | Dock setting | — | Settings → Reader → Dock: Icons or Names (the dock as before) | The old dock stays available | `src/types/preferences.ts`, `src/state/defaultPreferences.ts` (`dockStyle: 'icons'`), `src/quietReader/QuietReaderSettings.tsx` | Change the default to `'labels'` |
| 6 | Timer sheet | Opened at a guessed offset from the dock's centre | Opens above the Timer button (`dockButtonX`) | Buttons move with the dock style | `src/readerTools/Dock.tsx`, `QuietReader.tsx` | — |
| 7 | Dead CSS | `.qr-dock__extra` in readerTools.css and marginLayer.css | Removed | Nothing uses it | `src/readerTools/readerTools.css`, `src/studyDesk/marginLayer.css` | — |

## Phase 2: PDF pages in the reader's frame (0.78.0)

| # | What changed | Before | After | Why | Files | To reverse just this row |
|---|---|---|---|---|---|---|
| 8 | PDF header | Old top bar: Library, title, zoom −/100%/+, the shared tools, Reflowed text | The reader's header: Library, title (and the outline entry, phase 3), extension controls (the text-recognition chip), bookmark, settings | Same look as the reader | `src/pdf/pages/PdfPagesReader.tsx`, `src/quietReader/Chrome.tsx` (`Header` takes `extra`) | Revert the commit |
| 9 | PDF dock | Tools in the top bar | `ReaderDock reader="pdf"`: Display, Timer, Focus, then Margins, Document, Write, Sketch | One dock | `PdfPagesReader.tsx`; `src/readerTools/FocusHost.tsx` (`PdfToolsBar` and its pages extension removed) | — |
| 10 | Where you are | Old footer: page arrows, "Page 12 of 300", progress bar | "Page 12 of 300 · 4%" on a chip at the bottom right (above the dock when the pages are narrow), the reader's progress rail, page-turn buttons at the sides | Same as the reader | `PdfPagesReader.tsx`, `src/pdf/pages/pdfPages.css` | — |
| 11 | Layout | `.reader` flex column, `.reader__body` | `.qr.pdfp` root; `.pdfp__body` (what the desk margin and sketch panel pad) holds `.pdfp__frame` (stage, page turns, dock, sheets) | The reader's absolute layout | `pdfPages.css`, `src/studyDesk/pdfDesk.css` and `src/annotate/annotate.css` (`.reader__body` → `.pdfp__body`) | — |
| 12 | PDF Display sheet | — | Zoom (−, +, Fit to width), Pages (Paper, Sepia, Night), Theme, Page turns, PDF: Reflowed text / Original pages, All reading settings | Zoom and the text switch leave the top bar | `src/pdf/pages/PdfDisplaySheet.tsx` (new), `src/quietReader/DisplaySheet.tsx` (`Segmented`, `ThemePicker` exported) | — |
| 13 | Page tint | White pages always | `pdfPageTint`: Paper (default), Sepia (warm filter), Night (inverted picture) | Dark theme without a glaring page | `src/types/preferences.ts`, `src/state/defaultPreferences.ts`, `pdfPages.css` | — |
| 14 | Page turns and keys | Left/PageDown forward, right/PageUp back, fixed | Arrows follow Display → Page turns like the side buttons; PageDown/PageUp unchanged; Esc closes a sheet | Same as the reader | `PdfPagesReader.tsx` | — |
| 15 | Page bookmarks | — | Header bookmark: one per page, `pdf:page=N` | The reader's header has one | `PdfPagesReader.tsx` (`useMarks`) | — |
| 16 | Opening at a place | Always the saved page | `initialLocation` `pdf:page=N` (a bookmark opened from the Highlights page) | Bookmarks need it | `PdfPagesReader.tsx`, `src/cleanReader/ReaderSwitch.tsx` | — |
| 17 | Focus on PDF pages | Body class hid `.reader__topbar` and `.reader__footer` | The reader hides its header and dock itself, like the quiet reader; extension controls stay mounted, hidden | One way for both | `PdfPagesReader.tsx`, `src/readerTools/readerTools.css` (rules removed) | — |
| 18 | Tests | e2e looked for `.reader__footer`, `.reader__topbar`, Zoom in and Reflowed text in the top bar | `.pdfp .qr-where--right`, `.pdfp .qr-dock`, Zoom in and Reflowed text in Display | Follow rows 8–12 | `e2e/annotate.spec.ts`, `pdf-ocr.spec.ts`, `pdf-pages.spec.ts`, `shared-focus.spec.ts`, `study-desk.spec.ts`, `study-desk-piles.spec.ts` | Revert with the commit |

## Phase 3: Contents, Search, Marks, Words and Levels on PDF pages (0.79.0)

| # | What changed | Before | After | Why | Files | To reverse just this row |
|---|---|---|---|---|---|---|
| 19 | Text of the pages | — | `pdfText.ts`: each page's text-layer text, letters folded like tapped words with a map back to the layer, as a BookModel ("chapter" = page); `rangeInTextLayer` marks letters on the drawn page | Search, Words and Levels work on a BookModel | `src/pdf/pages/pdfText.ts` (new) | Revert the commit |
| 20 | Contents | — | The PDF's outline (two levels deep), else every page (every tenth past 400); the header shows the outline entry you are in; the progress rail ticks at top-level entries | The reader's Contents | `src/pdf/pages/pdfOutline.ts` (new), `PdfPagesReader.tsx` | — |
| 21 | Search | — | The reader's Search tab on the pages' text: This page, This book, Library, Dictionary; the match is marked on the page | The reader's Search | `PdfPagesReader.tsx` | — |
| 22 | Search keeps the chosen result | Moving to another chapter re-ran a live search and went back to result 1 | Only "This page" searches again when you move | On PDF pages every result is another "chapter" | `src/quietReader/searchState.ts` | Put `chapter` back in `run`'s dependencies |
| 23 | Marks | — | Page bookmarks; PDF highlights (`pdf:page=N`) if any; the empty list says words are marked on PDF pages by dragging over them (study desk) | The reader's Marks | `PdfPagesReader.tsx`, `src/quietReader/BookDrawer.tsx` (`highlightsEmpty`) | — |
| 24 | Words | — | Words saved from the book; the jump goes to the page a word was saved on and flashes it | The reader's Words | `PdfPagesReader.tsx` | — |
| 25 | Levels | — | Vocab levels from the pages' text, beside the pages (over them when there is not room); jumps flash the word | The reader's Levels | `PdfPagesReader.tsx`, `src/quietReader/MarginLevels.tsx` (`indexKey`, so the pages' index is kept apart from the reflowed text's) | — |
| 26 | Alt+S / Alt+V jumps | Did nothing on PDF pages | `pdf:page=N` places open their page, onto the word when known | Words saved on PDF pages carry that place | `PdfPagesReader.tsx` (`registerBookNavigator`) | — |
| 27 | Tests | — | e2e: the PDF dock's order, Contents and Search | — | `e2e/pdf-pages.spec.ts` | — |

**Known limits.** A scanned page has no text layer, so Search, Words and Levels see nothing on it (tapping a word still reads it with text recognition). Highlights on PDF pages are study desk items, not reader highlights, so they show in the desk and margin rather than in Marks.
