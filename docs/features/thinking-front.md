# Thinking desk: threads, moves, backlinks, masāʾil, muqābala, revisit, today

Roadmap id: `thinking-front` · Area: Reader experience · Status: in progress · Depends on: `study-desk`

Design spec: the single-file prototype "Thinking Desk" (Today, Reader, Thread, Muqābala, Revisit, Masāʾil). Its Arabic book
text is abridged sample text and is never used as book content.

Every change is listed, phase by phase, with how to switch it off or revert it, in
[docs/changes/thinking-front-changes.md](../changes/thinking-front-changes.md).

## 1. Purpose

The study desk collects what a reader notices. The thinking desk helps them think with it: name what a passage is doing
in an argument, gather passages from many books under one question, see everything that touches a passage, keep
questions open until a passage answers them, set two books side by side, come back to their own thoughts later and
judge them again, and look back at what they read a year ago.

It is not a parallel system. Everything is a desk, a desk item or a desk document from `src/studyDesk`:

| Thinking desk | Study desk |
|---|---|
| A thread | A desk of kind `thread` with a guiding question. Its document is the desk document (`DeskDocument.tsx`), unchanged except for an embedded mode |
| A passage | A desk item (a quote or a capture) with a place on the page: `pdf:<page>:…` on PDF pages, `clean:<chapter>:<start>:<end>` in the quiet reader |
| A tagged passage | The same item carrying a `move` |
| A thought | A note (`note`, or a Ḥāshiya `line`) |
| A masʾala | A `question` item, now with an answer |
| A comparison link | A row of the new `links` table between two items |
| A closing line | A row of the new `journal` table |

## 2. Expected behaviour

**Threads (Alt+T)**
- A thread belongs to a question, not a book. It has an Arabic and/or English name, a guiding question (editable in
  place), and members from any book. A passage can belong to several threads.
- Alt+T opens the thread picker in the Alt+D palette styles: every thread with how many items it holds and when it was
  last added to; type to filter, Enter on "Start a thread «…»" makes one and turns it on; "Stop collecting" turns the
  active thread off.
- The active thread shows as a bar under the reader's header: its name, how many it has gathered, Open thread, and
  Stop (Alt+T). While it is on, new thoughts, moves and masāʾil (from the passage bar, the Ḥāshiya or anywhere on the
  desk) join it.
- The passage bar has a +/✓ button per thread (the active thread first, then the three most recent): + adds the passage,
  ✓ shows it is in and takes it out.
- The Thread screen (Open thread, the dock's Thread button, Today, or the picker's Open): a thread switcher, the
  names and guiding question, counts (gathered, books, since), Collect while reading, and four tabs:
  - **Document**: the thread desk's own desk document, embedded (headings, lists, "/" picker, the + line, export).
    Members are its side panel; joining a thread puts the item at the end of the document, as a capture does on a
    book desk. Every quote keeps its citation and Go to source.
  - **Argument**: the tree built from moves: definitions first (with a note when a Muqābala link says two differ),
    then claims with their evidence and objections, replies under objections, open masāʾil placed under the passage
    they were asked on, then "Not tied yet".
  - **Gathered**: a timeline (a dot per item added, coloured by book) and the members grouped by book.
  - **Masāʾil**: the thread's questions, open and answered, with Find the answer and Reopen.

**Argument moves (1–5)**
- Five moves, chosen by hand only: تعريف Definition (1), دعوى Claim (2), دليل Evidence (3), اعتراض Objection (4),
  جواب Reply (5). Nothing is tagged automatically.
- A passage already on the desk shows a small handle at its start (its Arabic move label, or a dot). Clicking it opens
  the passage bar: "What is this passage doing?", the five moves, Write a thought, Ask a masʾala (Alt+Q),
  Compare (Alt+J), the thread buttons, Close (Esc). Pressing a move again takes it off.
- A new passage: select text (or drag over a scanned page) as for the Highlighter. On PDF pages the five moves join the
  Highlighter's bar; in the quiet reader a slim bar of moves appears below the selection (the highlight colours stay
  above it). Choosing a move keeps the passage as a quote on the current desk and opens its passage bar.
- After Evidence or Objection the bar asks "Evidence for which claim?" / "Which claim does it object to?"; after Reply,
  "Which objection does it answer?". Candidates are the claims (or objections) in the active thread first, then this
  book. "Leave it loose for now" is always there.
- Tagged passages carry their Arabic label beside their first words and a coloured underline in the move's colour,
  on PDF pages and in the quiet reader.
- Write a thought opens a composer in the Ḥāshiya strip: what do you make of it?, optional "This is my claim",
  optional links to other thoughts (any book). Ctrl+Enter saves.

**Backlinks**
- Beside each passage something touches, a dark count badge. Touching means: thoughts on it (its own gloss and notes
  at its place), thoughts linked to those (from any book), masāʾil asked on it or answered by it, and Muqābala links.
- Clicking the badge shows "Touching this passage" in the Ḥāshiya strip (over the right margin in the quiet reader):
  the passage, each thought (with "linked from your thought" where it came by a link), each masʾala, each link with
  Open side by side. "Back to the Ḥāshiya" or Esc closes it.

**Masāʾil (Alt+Q)**
- Question items have an open or answered state. Alt+Q asks a new masʾala: on the passage in the bar, or on the
  current page.
- The Masāʾil screen: how many are still open, how long the oldest has waited, Open / Answered / All, and each with
  when it was asked (and how long ago), where, its threads, Find the answer, or its answer with citation and Reopen.
- Find the answer opens the book the question was asked in, in hunting mode: a bar names the question with Cancel
  (Esc). The next passage clicked (or a new selection) asks "Does this answer the masʾala?" with Yes, this answers it
  and Not this one. The answer is the passage item, saved with its citation and the date. Undo is offered.
- Answered questions can be reopened.

**Muqābala (Alt+J)**
- Two books side by side, each pane listing that book's passages page by page. Click a passage on one side, then one
  on the other, then pick a relation (Same text, Supports, Differs, Explains, Quotes) and write an optional note.
- Lines join linked passages across the gap, coloured by relation (Differs dashed), with the relation's label on a
  chip in the gap. Clicking a chip or line shows the link's note and both citations.
- Under 900px wide the panes stack and the links are listed instead of drawn.
- "All links in your library" lists every link; opening one shows its two books.
- Alt+J (or Compare in the passage bar) opens Muqābala with that passage picked on the left.
- Links count as backlinks on both passages.

**Revisit**
- Thoughts written in the thinking composer are scheduled with the review scheduler (FSRS, `src/vocabulary/fsrs.ts`),
  first due a week later. Any other note can be added with "Revisit this" in Touching this passage.
- The Revisit screen shows the thought, the passage it is on, and three answers: **Still agree** (graded Good: the
  next visit is further out), **Revise** (the old wording is kept as a version, the history is shown, graded Hard),
  **Drop** (archived, history kept, Undo in the message). Today's queue and "How this thought changed" sit beside it.
- Send to Anki: due and scheduled thoughts go to Anki through AnkiConnect as a "Arabic Reader Thought" note type
  (Passage and source on the front, the thought on the back).

**Today and the closing prompt**
- Today sits above the Library (when there is anything to show): On this day (what was read a year ago, and six
  months ago; a thought from then that was later revised shows then and now side by side; that day's closing line),
  thoughts due for a revisit, open masāʾil, and threads with a sparkline of their growth.
- Closing a book (going back to the Library) after real activity (5 minutes or more, or anything made) offers an
  optional sheet: pages, minutes, moves, thoughts, masāʾil and items added to threads, and "What changed in your
  mind?" in one line, with Skip and Save. Saved lines form the reading journal, which feeds On this day.

**Export (not built yet: phase 8 was set aside)**
- The desk document's Export would add Obsidian (.md: front matter with title, kind, guiding question, tags and date;
  citations as `[[Book#p. N]]`; linked thoughts as backlinks) and Notion (.md: quotes with citations; open masāʾil
  as to-dos, answered ones ticked), next to Markdown and Word.

## 3. Data

All in the study desk database `arabic-reader-desk` (src/studyDesk/db.ts), version 2. Class A, local to the device
until sync covers it, in the full export and import (newer wins by `updatedAt`).

- `DeskItem` gains (all optional):
  - `move`: `'definition' | 'claim' | 'evidence' | 'objection' | 'reply'`
  - `tie`: the id of the item it supports, objects to or answers (a claim, or an objection for a reply)
  - `links: string[]`: thoughts this thought is linked to (kept on both sides)
  - `threads: string[]`: thread desk ids, with `joined: Record<threadId, ms>` for when it joined each (the growth
    sparkline and timeline)
  - `versions: { at, text }[]`: earlier wordings, oldest first (the current wording is the item's text)
  - `review: { due, every, agreed: number[], card? }`: next visit, days between visits, the dates of Still agree,
    and the FSRS card state
  - `answer`, `answeredAt`: a question's answering passage (an item id) and when
  - `droppedAt`: a thought dropped in Revisit (archived, still on its desk)
- `Desk.kind` gains `'thread'`, with `question` (the guiding question) and `titleAr` (the Arabic name; `title` is
  the English name, or the Arabic one when there is no English name).
- New tables: `links` (`DeskLink { id, a, b, rel, note, createdAt, updatedAt }`, indexed by `a` and `b`) and
  `journal` (`JournalEntry { id, at, bookId, bookTitle, pages, minutes, text, made, createdAt, updatedAt }`,
  indexed by `at`). `items` gains a multi-entry index on `threads`.
- Migration: version 1 rows need no change (every new field is optional); the upgrade only adds the tables and the
  index. Tested by opening a version 1 database with rows in it.
- Passages are existing locations; no new location format.
- Preferences (src/types/preferences.ts): see switches.

## 4. Switches

Settings → Reading → Thinking desk:

- `thinkingFrontEnabled` (default **off**): the whole feature. Off: no host, no shortcut, no Today panel, no screens,
  no export formats; the study desk is exactly as before. Data stays.
- One switch per part, all on by default under the main switch: `thinkingThreads`, `thinkingMoves`,
  `thinkingBacklinks`, `thinkingMasail`, `thinkingMuqabala`, `thinkingRevisit`, `thinkingToday`,
  `thinkingClosingPrompt` (the off switch for the closing sheet), `thinkingExport`.
- The study desk's own `studyDeskEnabled` must be on (the thinking desk uses its desks).

## 5. Edge cases

- A passage whose book was removed keeps its text; Go to source says the book is gone.
- A thread deleted (All desks): its members stay on their own desks and lose the thread id lazily (ignored when read).
- A tie to an item that was deleted reads as loose.
- A move changed to another move drops its tie (a reply's objection is no longer the right kind).
- A reply tied to an objection that loses its move shows under "Not tied yet".
- Answer deleted: the question reads as open again.
- Thoughts dropped are left out of Revisit, Touching and Gathered, but stay on their desk and in their documents.
- Two clicks for a Muqābala link on the same side replace the first pick; a link to itself is refused.
- A link between passages of the same book is allowed (two places in one book).
- The closing sheet never shows during a capture trip, and only once per reader visit.
- On this day with no reading a year ago shows six months ago; with neither, it is left out.
- Very many passages on a page: handles and badges are drawn for the pages on screen only.

## 6. Acceptance criteria

- With `thinkingFrontEnabled` off, nothing new renders, no new chord is registered and the study desk works as before.
- A thread can be made from Alt+T, turned on and off, renamed in Arabic and English, its question edited; new
  thoughts, moves and masāʾil join it while it is on; a passage can be in two threads.
- The Thread screen's Document tab is the desk document of the thread desk (no fork), with export.
- Tagging a passage with 1–5 on a PDF page and in the quiet reader stores the move and shows the label and underline;
  ties are asked for Evidence, Objection and Reply; the Argument tab shows the tree.
- Badges count everything that touches a passage and the Touching panel lists them.
- A masʾala can be asked, hunted, answered with a citation, and reopened.
- A Muqābala link can be made, drawn, listed on narrow screens, and counts on both passages.
- Revisit grades with FSRS; Revise keeps the old wording; Drop archives with Undo.
- Today shows On this day, revisits due, open masāʾil and threads; the closing sheet saves a journal line.
- Obsidian and Notion exports come out as described.
- Unit tests cover moves and ties, the argument tree, touching, scheduling, the export formats, On this day, the
  closing criteria and the database migration. tsc, lint, unit tests and the size check pass.

## 7. Decisions made while building

- **Branch.** Built on the session branch `claude/thinking-desk-threads-moves-yr6wq6` (this environment can only push
  there) instead of `feat/thinking-front`, branched from `refactor/integration`'s content, with a PR into
  `refactor/integration`. PR #73 had already been merged into `main` when this started.
- **Off by default.** `thinkingFrontEnabled` starts off so existing e2e tests and existing habits see no change; turn it
  on in Settings → Reading → Thinking desk.
- **Clicking a passage.** A click on a word keeps opening the dictionary, so an existing passage opens its bar from a
  handle at its start (its move label, or a dot), and a new passage from a selection, as the Highlighter does.
- **Labels "inline".** The quiet reader's text is never changed (its offsets are the `clean:` places), so labels and
  underlines are drawn over the text, just before the passage's first word, not inserted into it.
- **Muqābala panes list passages**, page by page, rather than rendering two whole books: linking needs passages on the
  desk anyway, and two live PDF readers side by side would double the pages view. Pick more in the reader, then link.
- **Thread membership** is `threads` on the item (plus `joined` dates for the growth chart), not a copy: the item stays
  on its own desk and is embedded in the thread's document.
- **A thought's history** keeps earlier wordings in `versions`; the item's own text is the current one.
- **Revisit's scheduler** is the vocabulary's FSRS (`ts-fsrs`): Still agree = Good, Revise = Hard; the first visit is
  set a week out by hand.
- **Closing prompt** shows when the reader closes to the Library; book switches inside one visit count as one session,
  journalled under the book open at the end. Pages are counted for PDF books (pages seen); text books report minutes.
- **Screens** (Thread, Masāʾil, Muqābala, Revisit) are full-page sheets over the app, loaded on first use, opened from
  the reader's dock, the passage bar and Today; they have no address of their own yet.
- **Size.** Everything new loads on demand; the entry script and styles were within 12 kB and 1.3 kB of their budgets.

## 8. Not yet

- Phase 8, Obsidian and Notion export, was set aside before it was folded in; `thinkingExport` exists but does nothing yet.

- Sync of the new tables (they follow the desk tables).
- Moves inside epub (iframe) books; rendering two live readers in Muqābala.
- Hash addresses for the new screens.
