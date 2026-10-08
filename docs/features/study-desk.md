# Study desk

Roadmap id: `study-desk` · Area: Reader experience · Status: in progress (branch `feat/study-desk`) · Depends on: nothing

Concept and prototypes: [Study Desk Plan](https://claude.ai/artifact/FjdxN1wKtaYzSTRLTvtKx4), [Reading Graph](https://claude.ai/artifact/A73TgxbGPwqbKnj1Eb6GK5), [Margin Desk](https://claude.ai/artifact/YNXF4CEhopbyMF9L9Q8opA).

Every change is listed, phase by phase, with how to switch it off or revert it, in [docs/study-desk-changes.md](../study-desk-changes.md).

## 1. Purpose

Everything a reader notices while reading becomes an item: a concept they type, a quote, a region of the page, a note in the margin. Items gather on a desk. A desk is one free text document, like a notepad, with its items embedded in it. Each book gets a desk on its first capture, and the reader can make their own desks (an essay, a topic) that take captures from any book.

## 2. Expected behaviour

**Inbox (Alt+I)**
- Opens in the same pop-up as the Alt+D dictionary search, in the same style (floating, palette, drawer or sheet).
- The input row searches the inbox; Enter on "New concept" adds what was typed as a concept.
- Rows look like dictionary results: the text, its source, a type label. The selected row expands with Show in document, Go to source, Send to another desk and Delete.
- "Capturing to" chooses the desk new captures go to, or makes a new desk.

**Capture**
- Alt+C opens a one-line concept strip; Enter sends it to the inbox and the desk.
- Alt+X arms region capture: drag a box over the page. On text pages the words inside become the quote, and can be highlighted. On PDF pages the region is also cut out of the page image.
- Every capture is added to the inbox and, at the same moment, at the end of the current desk's document.

**Desk document (D)**
- D (no modifier, while not typing and with no popup open) opens it from any reader; Esc closes it.
- A full-page notepad: type anywhere, Enter for new lines, "# " and a space at the start of a line for a heading.
- Inbox items sit in the text as blocks that cannot be typed into. Deleting one from the text keeps it in the inbox, under "Taken off the page", with Put back.
- A collapsible side panel holds the inbox in page order: search or write a concept, Capture, Pull in, drag or arrows to reorder, a menu to file under a heading, an eye to hide.
- Items in the text: on hover, Go to source (this book or another, PDF places included), Add or Edit note in place, Remove from page. Each kind looks like what it is (quotes as quotations, concepts as a compact line, questions marked, flashcards front and back, screenshots wide; a click shows one at full size).
- "/" alone on a line puts an item there (or moves it); side-panel rows can be dragged into the text.
- Writing: "# " heading, "- " list, "1. " numbered list, "> " quotation at the start of a line; a toolbar with bold, italic, heading, lists and quotation. Each line takes its direction from its own letters.
- The side panel is an outline: headings with how many items each holds, click to scroll there. A word count and Saved show above the title.
- Export: copy as text, save as Markdown or Word, quotes and screenshots cited by book and chapter or page.
- Desk tabs show this book's desk and your recent desks; "+ Desk" makes one; All desks finds any desk by title or content, opens it, or deletes one of your own.

**Margins (Alt+M)**
- In the quiet reader, the desk spreads into the page margins. Items whose source is on the page sit beside their words, joined by a thin line.
- Double-tap empty margin space and type straight away. The note stays plain text and is tied to the line beside it. It can be turned into a note, question, concept, flashcard (added to review straight away) or heading, or tied to exact words.
- Margins: both sides, right only, left only, or off. On a window too narrow for two margins, "both sides" moves the page over and uses one wide margin. Notes in the document: all, only chosen, or none. Notes to the inbox: when sent, or automatically.
- Screenshots sit in a small frame; hovering opens a preview beside the margin that never covers the text column. Click or Space keeps it open, Esc closes.

**Pull in (Alt+U)**
- Search saved highlights, words and desk items from other books, or pick an image file, and place it in a margin or the inbox. Alt+P stays the saved-entries export.
- A margin placement sits at the middle of the visible page; the new item's source points to where it came from. Pull in is also a button in the inbox and the document's side panel.

**Capture trip (Go to another book)**
- From Pull in, Go to another book… opens a book with a bar across the top saying what is happening. Margin or inbox is chosen before leaving.
- Capture (Alt+X or the bar's button) files the capture on the desk the trip started from, pinned to the place on the page left behind, and goes straight back there. Cancel and return, or Esc, goes back without capturing.

**Images in the margins**
- Paste an image into a margin note to make it a screenshot; drop an image file on a margin for a new screenshot note at that height, or on a note to add it there.

**PDF pages**
- A margin to the right of the pages, whenever margins are on; the pages fit beside it. Margins: Hidden frees the space.
- Regions captured on PDF pages (scanned or not) show as boxes on the page, with a card each in that margin, where a gloss can be written.
- Double-tap the margin to write a note tied to that height of the page, with the same options as the quiet reader's margin notes; Tie to words ties it to words dragged over next.
- Highlight without Alt+X: drag over a scanned page (mouse or pen) or select text on a page with a text layer. The box snaps to the words (the text layer, or the words the chosen recognition engine reads there); Gloss in the margin, Send to inbox, Snap to words on or off, Esc cancels. Drop an image file on it for a screenshot note. Pull in places items there.

## 3. Data

- Its own database `arabic-reader-desk` (src/studyDesk/db.ts): `items` and `desks`. Declared in the storage registry as class A, local to the device until sync covers it, in the full export. Images in BlobStore namespace `desk`.
- A desk's document is HTML cleaned on every save (src/studyDesk/docHtml.ts): paragraphs, headings, lists, bold, italic and the item embeds; nothing else survives.
- A place on the page is stored as the existing location strings (`clean:<chapter>:<start>:<end>`, an epub CFI) or `pdf:<page>:<x>:<y>:<w>:<h>` for a PDF region.

## 4. Switches

- Settings → Reading → Study desk: `studyDeskEnabled` turns the whole feature off (no hosts mount, nothing is captured).
- `studyDeskMargins`, `studyDeskMarginsInDocument`, `studyDeskMarginsToInbox` hold the margin settings.

## 5. Not yet

- Sync of desk tables; graph and canvas views; root and lemma links; margins in the epub (iframe) reader; a left-hand margin beside PDF pages.
