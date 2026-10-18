# Thinking desk: threads, moves, backlinks, masāʾil, revisit, today

Roadmap id: `thinking-front` · Area: Reader experience · Status: in progress · Depends on: `study-desk`

Design spec: the single-file prototype "Thinking Desk" (Today, Reader, Thread, Muqābala, Revisit, Masāʾil; Muqābala is set aside, see below). Its Arabic book
text is abridged sample text and is never used as book content.

Every change is listed, phase by phase, with how to switch it off or revert it, in
[docs/changes/thinking-front-changes.md](../changes/thinking-front-changes.md).

## 1. Purpose

The study desk collects what a reader notices. The thinking desk helps them think with it: name what a passage is doing
in an argument, gather passages from many books under one question, see everything that touches a passage, keep
questions open until a passage answers them, come back to their own thoughts later and
judge them again, and look back at what they read a year ago.

It is not a parallel system. Everything is a desk, a desk item or a desk document from `src/studyDesk`:

| Thinking desk | Study desk |
|---|---|
| A thread | A desk of kind `thread` with a guiding question. Its document is the desk document (`DeskDocument.tsx`), unchanged except for an embedded mode |
| A passage | A desk item (a quote or a capture) with a place on the page: `pdf:<page>:…` on PDF pages, `clean:<chapter>:<start>:<end>` in the quiet reader |
| A tagged passage | The same item carrying a `move` |
| A thought | A note (`note`, or a Ḥāshiya `line`) |
| A masʾala | A `question` item, now with an answer |
| A comparison link | A row of the new `links` table between two items (kept; no screen makes or shows them since Muqābala was set aside) |
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
- A thread can be renamed, archived and deleted (0.125.0). The Thread screen's head has a **Manage** menu: **Rename…**
  (English name, Arabic name and guiding question together; the names and question can still be edited in place),
  **Archive** / **Unarchive**, and **Delete…** (asks first; the gathered items stay on their own desks, the thread's
  document goes; Undo in the message brings back the desk, its document and its members). An archived thread is out of
  the Alt+T picker's list, the passage bar and Today, and stops collecting if it was the active thread; the picker
  lists archived threads last, under "Archived", where choosing one (Enter, or Unarchive) brings it back. Archived
  threads can still be opened (Open in the picker) and show "Archived" in the Thread screen. All desks lists threads
  under "Threads", and deleting one there asks first, like any desk. Deleting the active thread also stops collecting.
- The Thread screen (Open thread, the dock's Thread button, Today, or the picker's Open): a thread switcher, the
  names and guiding question, counts (gathered, books, since), Collect while reading, and four tabs:
  - **Document**: the thread desk's own desk document, embedded (headings, lists, "/" picker, the + line, export).
    Members are its side panel; joining a thread puts the item at the end of the document, as a capture does on a
    book desk. Every quote keeps its citation and Go to source. A quote or thought tagged with a move shows its Arabic
    name (تعريف دعوى دليل اعتراض جواب) in the move's colour before it, in a thread's document and a book desk's alike
    (0.125.0, with Argument moves on).
  - **Argument**: the tree built from moves: definitions first, then claims with their evidence and objections, replies under objections, open masāʾil placed under the passage
    they were asked on, then "Not tied yet". **Draft from the argument** (0.126.0) writes it into the thread's Document
    as an outline: a Definitions heading with the definitions, then each claim as a heading (its own words when it is
    your claim, or the first words of the passage, which is then quoted under it) with its evidence, then its
    objections each followed by its replies, as the passages themselves with their citations; the thread's own thoughts
    on those passages follow them as plain paragraphs (each once); untied passages go last under "Not tied yet". A
    document with nothing in it gets the outline as it is; otherwise it is added at the end under a heading "Draft —
    <date>", never over what is there. The Document opens on the result, and Undo in the message puts the previous
    document back. Needs Argument moves on.
  - **Gathered**: a timeline (a dot per item added, coloured by book) and the members grouped by book.
  - **Masāʾil**: the thread's questions, open and answered, with Find the answer and Reopen.

**Argument moves (1–5)**
- Five moves, chosen by hand only: تعريف Definition (1), دعوى Claim (2), دليل Evidence (3), اعتراض Objection (4),
  جواب Reply (5). Nothing is tagged automatically.
- A passage already on the desk shows a small handle at its start (its Arabic move label, or a dot). Clicking it opens
  the passage bar: "What is this passage doing?", the five moves, Write a thought, Ask a masʾala (Alt+Q),
  the thread buttons, Close (Esc). Pressing a move again takes it off.
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
  at its place), thoughts linked to those (from any book), masāʾil asked on it or answered by it.
- Clicking the badge shows "Touching this passage" in the Ḥāshiya strip (over the right margin in the quiet reader):
  the passage, each thought (with "linked from your thought" where it came by a link), each masʾala. "Back to the Ḥāshiya" or Esc closes it.
- A thought can be linked to another one later (0.125.0): **Link to another thought…** on a thought in Touching this
  passage, and under the thought in Revisit, opens the finder the composer uses (type words from any thought) and shows
  what it is already linked to, each with ×. Links are kept on both thoughts; Undo is offered.

**Masāʾil (Alt+Q)**
- Question items have an open or answered state. Alt+Q asks a new masʾala: on the passage in the bar, or on the
  current page.
- The Masāʾil screen: how many are still open, how long the oldest has waited, Open / Answered / All, and each with
  when it was asked (and how long ago), where, its threads, Find the answer, or its answer with citation and Reopen.
- Find the answer opens the book the question was asked in, in hunting mode: a bar names the question with Cancel
  (Esc). The next passage clicked (or a new selection) asks "Does this answer the masʾala?" with Yes, this answers it
  and Not this one. The answer is the passage item, saved with its citation and the date. Undo is offered.
- Answered questions can be reopened.

**Muqābala (set aside)**
- Muqābala (two live books side by side, with relation links between passages, Alt+J) was built through 0.122.0 and
  set aside in 0.123.0: the reader did not want it for now. Its full version is preserved on the branch
  `claude/thinking-desk-muqabala` (tag `thinking-desk-with-muqabala`); reverting the 0.123.0 commit brings it back.
- Nothing in the app makes or shows a link now: no Alt+J, no Compare in the dock or the passage bar, no Open side by
  side, no Muqābala row in Settings. The data stays (see section 3).

**Revisit**
- Thoughts written in the thinking composer are scheduled with the review scheduler (FSRS, `src/vocabulary/fsrs.ts`),
  first due a week later. Any other note can be added with "Revisit this" in Touching this passage.
- The Revisit screen shows the thought, the passage it is on, and three answers: **Still agree** (graded Good: the
  next visit is further out), **Revise** (the old wording is kept as a version, the history is shown, graded Hard),
  **Drop** (archived, history kept, Undo in the message). Today's queue and "How this thought changed" sit beside it.
- **Dropped** (0.125.0): once a thought has been dropped, a Dropped tab (with how many) lists them, the latest drop
  first, each with Open page and **Restore**, which takes it out of the dropped list and schedules it again a week out
  (Undo in the message puts the old state back).
- **Revisit in the dock** (0.125.0): the dock has a Revisit button beside Thread and Masāʾil. The dock has no badge, so
  the number of thoughts due is in its tooltip and its screen-reader name.
- Send to Anki: due and scheduled thoughts go to Anki through AnkiConnect as a "Arabic Reader Thought" note type
  (Passage and source on the front, the thought on the back).

**Today and the closing prompt**
- Today sits above the Library (when there is anything to show): On this day (what was read a year ago, and six
  months ago; a thought from then that was later revised shows then and now side by side; that day's closing line),
  thoughts due for a revisit, open masāʾil, and threads with a sparkline of their growth.
- Closing a book (going back to the Library) after real activity (5 minutes or more, or anything made) offers an
  optional sheet: pages, minutes, moves, thoughts, masāʾil and items added to threads, and "What changed in your
  mind?" in one line, with Skip and Save. Saved lines form the reading journal, which feeds On this day.

**Export (0.124.0)**
- The desk document's Export menu (Copy as text, Markdown, Word) gains two more, for a thread's document and a book
  desk's alike, while `thinkingExport` is on:
  - **Save for Obsidian** (.md): front matter (title, kind, the guiding question of a thread, tags, date); the Arabic
    name before the title of a thread; quotes with their citation and a wiki link `[[Book#p. N]]` (the chapter label
    for text books), a move as a tag (`#claim`); a thought as "My note" with its linked thoughts as `[[Book#place|“…”]]`
    backlinks; masāʾil as to-dos, ticked when answered, with the answering passage quoted under them.
  - **Save for Notion** (.md): the same document as plain Markdown that Notion takes on paste or import: quotes with
    plain citations, thoughts as paragraphs, masāʾil as to-dos; no front matter, wiki links or tags.
- The formats are registered by the thinking desk's app host (`src/thinking/exportFormats.ts`) in a small registry the
  Export menu reads when it opens (`src/studyDesk/exportFormats.ts`), so with the thinking desk off the menu is exactly
  as before.

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
- The `links` table and the `DeskLink` store functions stay with their data (desk database version 2 had already
  shipped to test profiles; links are still in the full export and import). Nothing reads them since 0.123.0.
- Preferences (src/types/preferences.ts): see switches.

## 4. Switches

Settings → Reading → Thinking desk:

- `thinkingFrontEnabled` (default **off**): the whole feature. Off: no host, no shortcut, no Today panel, no screens,
  no export formats; the study desk is exactly as before. Data stays.
- One switch per part, all on by default under the main switch: `thinkingThreads`, `thinkingMoves`,
  `thinkingBacklinks`, `thinkingMasail`, `thinkingRevisit`, `thinkingToday`,
  `thinkingClosingPrompt` (the off switch for the closing sheet), `thinkingExport`. `thinkingMuqabala` still exists in the
  preferences but is unused (and has no row in Settings) since 0.123.0, so saved settings stay valid.
- The study desk's own `studyDeskEnabled` must be on (the thinking desk uses its desks).

## 5. Edge cases

- A passage whose book was removed keeps its text; Go to source says the book is gone.
- A thread deleted (All desks or its Manage menu): its members stay on their own desks and leave the thread. Undo (from the Manage menu) puts the thread, its document and the members that still exist back.
- The active thread archived or deleted, anywhere: collecting stops.
- An archived thread keeps everything (members, document, names); its members still show in Touching and Gathered.
- A tie to an item that was deleted reads as loose.
- A move changed to another move drops its tie (a reply's objection is no longer the right kind).
- A reply tied to an objection that loses its move shows under "Not tied yet".
- Answer deleted: the question reads as open again.
- Thoughts dropped are left out of Revisit, Touching and Gathered, but stay on their desk and in their documents, and are listed under Revisit's Dropped tab until restored.
- Linking a thought to itself is not offered; a dropped thought is not offered to link to.
- The closing sheet never shows during a capture trip, and only once per reader visit.
- On this day with no reading a year ago shows six months ago; with neither, it is left out.
- Drafting twice adds a second "Draft — <date>" section; an item already in the Document (every member is, once it joined) appears again in the draft.
- Draft with no moves in the thread: the button is not offered.
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
- Revisit grades with FSRS; Revise keeps the old wording; Drop archives with Undo; dropped thoughts are listed and can be restored.
- Draft from the argument writes the outline into the Document (appended under a dated heading when it has content) and can be undone.
- A thread can be renamed, archived and unarchived, and deleted with Undo; threads are listed in All desks; a tagged quote shows its move in the document; Revisit is in the dock; a thought can be linked to another later.
- Today shows On this day, revisits due, open masāʾil and threads; the closing sheet saves a journal line.
- Obsidian and Notion exports come out as described, for a thread's document and a book desk's.
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
- **Muqābala set aside** (0.123.0). The reader decided it is not wanted for now. It is removed from this branch (the
  screen, `src/thinking/live/`, `muqabala.ts`, its CSS and every entry point) and preserved whole on the branch
  `claude/thinking-desk-muqabala` and the tag `thinking-desk-with-muqabala`. The data side stays: the `links` table,
  `DeskLink` and the store functions, so desk database version 2 (already on test profiles) and the export are
  unchanged. Backlinks and the Argument tab no longer read links (the Muqābala cards and "These definitions differ" are
  gone), since nothing can make or delete one; `thinkingMuqabala` stays in the preferences, unused, as `thinkingExport`
  did. `Frame` lost its `beside` prop, which only Muqābala used.
- **Thread membership** is `threads` on the item (plus `joined` dates for the growth chart), not a copy: the item stays
  on its own desk and is embedded in the thread's document.
- **A thought's history** keeps earlier wordings in `versions`; the item's own text is the current one.
- **Revisit's scheduler** is the vocabulary's FSRS (`ts-fsrs`): Still agree = Good, Revise = Hard; the first visit is
  set a week out by hand.
- **Closing prompt** shows when the reader closes to the Library; book switches inside one visit count as one session,
  journalled under the book open at the end. Pages are counted for PDF books (pages seen); text books report minutes.
- **Screens** (Thread, Masāʾil, Revisit) are full-page sheets over the app, loaded on first use, opened from
  the reader's dock, the passage bar and Today; they have no address of their own yet.
- **Export** (0.124.0). Folded in from the set-aside phase 8 commit. The Export menu reads a small registry of formats
  (opened with the menu, so nothing changes while the thinking desk is off); the desk document hands it the desk and its
  items, which the two formats need for the thread's question and for linked thoughts and answers. Both save as `.md`
  under the desk's title, like Markdown does; Settings → Reading → Thinking desk has a row for `thinkingExport`. Obsidian
  links point to the book's page (`[[Book#p. N]]`), which exists as a note only if the reader makes one.
- **Threads: rename, archive, delete** (0.125.0). The menu is in the Thread screen's head (a small "Manage" menu in
  the Export menu's look). Archive is `archivedAt` on the desk (no database change; the field is not indexed), set
  and cleared by `setDeskArchived`; archived threads are hidden by the thinking desk's own lists (picker, passage bar,
  Today), not by the study desk. Delete takes a snapshot first (`deleteDeskKeepingUndo`, `restoreDeletedDesk`), so
  Undo can restore the desk, its document, the items that lived on it and each member's place in the thread. All
  desks (the study desk's list) gains a Threads section and the same confirm-then-delete as other desks, without
  Undo, since the list has only plain messages. "Stop collecting" when the active thread goes is done by the app host
  watching the desks, so it also covers deleting from All desks. Opening a thread from All desks shows its document
  in the study desk's document, as before; the Thread screen is one click away from the picker.
- **Move labels in the document** (0.125.0). The embed carries `data-move`; the label and colour are drawn by
  `thinking.css` (the Arabic name before the quote, the quote's rule in the move's colour), only while Argument moves
  is on (the app host sets a class on the page), so nothing changes with the thinking desk off.
- **Revisit in the dock** (0.125.0). The dock's `live` text replaces the label in the label-style dock, so it is not
  used as a badge; the due count is in the tooltip and name instead. Re-registered when the thoughts change.
- **Dropped** (0.125.0) is a tab, shown only once something has been dropped. Restore sets a fresh first visit
  (`firstReview`) and forgets the old schedule; Undo puts the old `droppedAt` and `review` back.
- **Link later** (0.125.0). One finder, `ThoughtFinder`, now serves the composer and the Link to another thought…
  control; only thoughts (not passages or masāʾil) can be linked. Links are patched on both thoughts in one write
  (`linkPatches`).
- **Draft from the argument** (0.126.0). Pure part in `src/thinking/draft.ts` (the argument tree to ordered blocks, the
  blocks to document HTML, and the document with the draft in it), tested. It uses the desk document's own format: a
  heading (`h3`), paragraphs, and item embeds (`embedHtml`), so passages show with their citation and Go to source as
  anywhere in the Document. Decisions: the switch is `thinkingMoves` (the Argument tab's), no new preference; definitions
  are written first under a "Definitions" heading, as in the Argument tab (the brief named only claims and the loose
  ones); open masāʾil are left out; evidence comes before objections whatever order they were tagged in; the items stay
  in the Document where they already were and are embedded again in the draft (the desk document draws an item wherever
  it is embedded), rather than being moved out of the order the reader may have set; the button reads the document as
  saved just before writing (the editor saves quietly), and Undo restores exactly that text and makes the editor load it
  again.
- **Size.** Everything new loads on demand; the entry script and styles were within 12 kB and 1.3 kB of their budgets.

## 8. Not yet

- Sync of the new tables (they follow the desk tables).
- Undo for deleting a thread from All desks (the thread's Manage menu has it).
- Moves inside epub (iframe) books.
- Hash addresses for the new screens.
