# Write and Sketch: the next level

Roadmap id: `ink-next` · Area: Study tools · Status: idea (2026-10-11) · Builds on: `src/annotate` (0.71–0.93),
the study desk's margins (Ḥāshiya), the dictionary, vocabulary and Anki sync.

Today's history is in `docs/changes/annotate-changes.md` and `docs/changes/sketch-margin-changes.md`. This document
says how Write and Sketch work now, what holds them back, and what would make them a study tool rather than a
drawing tool, in phases that can each ship on their own.

## 1. How it works today

**Write (Alt+W)** puts ink straight on the page.
- New reader: each stroke is tied to the **word it starts on** (character offset plus an offset in em), so it moves
  with the text when the layout reflows. PDF pages: strokes sit in page units, and turn with Night pages.
- Ink bar: pen, marker (see-through), eraser, colours, widths, Undo/Redo, Done. A stylus always writes; once a pen
  has been seen, fingers scroll (palm rejection).
- Writing in the Ḥāshiya (the margins) makes an **ink card** instead: strokes within 2.5 s and 36 px join the same
  card. Cards fold, pin beside their line, and export to Word.

**Sketch (Alt+K; Alt+Shift+K for a new sheet)** opens a sheet beside the page.
- **Freehand**: pen, marker, eraser, hand, lasso (select, move, resize, delete strokes).
- **Diagram**: boxes, connectors, arrows, tints, multi-select, Tidy (tree layout), and templates (root family,
  i‘rāb, argument map). **Quote** nodes hold words from the page (or a box on a scanned page) and ↗ jumps back to it.
- **Sheets**: tabs for every sheet covering the place (its page, a page or chapter range, or the whole book); rename,
  duplicate, move, delete with Undo; *All sheets* with search over names and node words.
- **Out of the sheet**: an outline or node note to the Ḥāshiya (it follows the sheet until edited), SVG, PNG and
  Markdown export.

Storage: its own IndexedDB database `arabic-reader-ink` (`strokes`, `sketches`), in the full export, **not synced**.

## 2. What holds it back

| Gap | Effect |
|---|---|
| Ink is only a picture | Handwriting can't be searched, looked up or turned into notes or cards |
| Ink doesn't talk to the rest of the app | Underlining a word doesn't highlight it; circling a word doesn't save it; a sketch never becomes something to review |
| Diagrams are built by hand | A root family or an i‘rāb tree means typing what the dictionary and the text already know |
| Nothing for the hand itself | An Arabic learner also learns to *write*: letter forms, joins, the baseline. There's no practice surface |
| One device only | Ink and sketches stay where they were made; a tablet sketch can't be read on the desktop |
| Untested on real pens | Apple Pencil, Android styluses and Windows pens are handled in theory only |
| Long strokes after reflow | A stroke is tied to its first word; its far end can drift off its words after a big reflow |

## 3. The next level

Five themes, most valuable first for an Arabic reader. Each item names what users get, how it fits the app, and the
main risk.

### A. Ink that understands (handwriting → text)

1. **Recognise handwriting** in ink cards, sheet strokes and a new *write a word* pad. Arabic and English.
   - Desktop: the Windows handwriting recogniser through the Electron main process, as Windows OCR already is
     (`electron/windows-ocr.ps1`). Android: Google ML Kit Digital Ink Recognition, which runs on the device and lists
     Arabic, through a Capacitor plugin. Web and iOS: no built-in recogniser; the feature hides there, or an opt-in
     engine is added later the way OCR engines are (`src/pdf/ocr`).
   - The recognised text is stored next to the strokes (`text`, `lang`, `engine`), never instead of them.
   - Risk: recogniser quality on vowelled or classical script; every platform behaves differently. *To verify: Arabic
     support in the Windows recogniser on the user's machine, and ML Kit's Arabic model size.*
2. **Write to look up**: handwrite a word in the dictionary search (Alt+D) or the popup's search, and it looks it up.
   Very useful when you can't type Arabic.
3. **Search handwriting**: *All sheets* and book search (Alt+S) also match recognised ink text.
4. **Ink card → text note**: one tap converts a card to an editable note (the picture stays attached).

### B. Ink that acts (gestures on the page)

With Write on, an optional *gestures* mode turns marks into actions. Each one shows what it did, with Undo.
- **Underline** a run of words → a highlight in the current colour.
- **Circle** a word → it opens the dictionary popup on that word (lookup by ink).
- **Circle then tick** (or circle with the marker) → the word is saved to vocabulary, with its sentence.
- **Bracket** in the margin beside lines → a Ḥāshiya note anchored to those lines.
- **Strike-through** → nothing is deleted; it adds a "check this" mark, listed in the drawer.

Fit: these reuse the existing highlight, popup, vocabulary and margin code; recognising the gesture is geometry over
the stroke and the words under it (`geometry.ts`, `textOffsets`). Risk: false positives while simply writing, so it
is off by default and only active with Write on.

### C. Diagrams that build themselves

- **Root family from a word**: select a word → *Sketch its root*. AraMorph and the dictionaries already give the root
  and its derived forms; the root-family template fills itself, with each form as a node linked to its entries.
- **I‘rāb tree from a sentence**: select a sentence → its words become nodes in the i‘rāb template, in order, ready
  for labels (fā‘il, maf‘ūl bihi ...). The app doesn't parse grammar; it saves the setting-up.
- **Verb form chart**: for a verb, Forms I–X with the ones that exist in the dictionaries filled in (the verb-forms
  data is already there).
- **Quote clusters**: drag several highlights from the drawer onto a sheet; each becomes a quote node linked to its
  place.

Risk: low; it only fills existing templates. AraMorph gaps show as empty nodes, not wrong ones.

### D. Sketches you review (learning loop)

- **Card from a node**: any diagram node (or a group) → a flashcard. Front: the node or the question; back: its
  children or note. It goes into the normal review queue and Anki sync.
- **Image occlusion**: on a sheet, mark boxes or labels to hide; review shows the sheet with one hidden at a time.
  Works for root families, i‘rāb trees and maps.
- **Sheet review mode**: step through a sheet's nodes one by one (presentation style), each revealed on a tap.

Fit: flashcards, FSRS scheduling and Anki export exist (`src/flashCard`, `src/vocabulary`, `src/anki`); the new part is
a card type that points at a sheet. Data class A (user records), synced like other cards once sheets sync.

### E. Writing practice (the hand)

- **Practice sheets**: lined paper with a baseline and Naskh guides (letter height, ascenders, descenders), as a new
  sheet background.
- **Letter forms**: a letter in its four positions to trace over (faint model under the pen), then free writing.
- **Copy a sentence**: the selected sentence appears as a faint model line to copy beneath; with handwriting
  recognition (A1), the copy is checked word by word.

Risk: making the model text look right (font and baseline); judging writing quality is out of scope, only "did the
recogniser read the same word".

### F. Foundations (do before or alongside)

- **Sync ink and sketches** (`arabic-reader-ink` into the synced tables, with a schema version and a migration test).
  Needed for anything you'd use on two devices, and for D.
- **Smoother ink**: pressure-aware stroke outlines (in the style of perfect-freehand), and lower latency on the pen
  path.
- **Real-device pass**: Apple Pencil (hover, double-tap to switch to eraser), Android stylus, Windows pen. Fix what it
  finds.
- **Long strokes anchored at both ends**: store the word at the end as well, so a stroke stretches with reflow
  instead of drifting.
- **Paper backgrounds** for sheets: plain, dots, grid, lined (lined is also E's base).
- **Notion / Obsidian export**: still parked at the user's request; Markdown, SVG and PNG are already there.

## 4. Suggested phases

Each phase is one branch and ships on its own. Effort: S under a day, M a few days, L a week or more, with tests.

| Phase | Contents | Users see | Effort | Main risk | Depends on |
|---|---|---|---|---|---|
| 1 | F: sync for ink and sketches, smoother ink, paper backgrounds | Sketches on every device; nicer strokes | M | Sync conflicts on big sheets | — |
| 2 | C: root family, i‘rāb tree, verb form chart, quote clusters | One-click study diagrams | S–M | AraMorph gaps | — |
| 3 | D: card from a node, image occlusion, sheet review | Sketches become reviews and Anki cards | M | A new card type in review and Anki | 1 (for sync) |
| 4 | A1–A4 on desktop (Windows recogniser) | Handwriting search, write-to-look-up, ink → text | M–L | Recogniser quality on Arabic | — |
| 5 | A on Android (ML Kit) | The same on phones and tablets | M | Model download size, plugin upkeep | 4 |
| 6 | B: page gestures | Underline, circle, bracket act on the text | M | False positives | — |
| 7 | E: practice sheets, letter forms, copy a sentence | Writing practice | M | Model text rendering | 1 (backgrounds), 4 (checking) |
| 8 | F: real-device pass, both-ends anchoring | Fewer pen surprises | S–M | Needs the devices | — |

Recommended start: **2** (small, high value, no new platform code), then **1**, then **3**. Handwriting (4–5) is the
biggest jump, but also the most uncertain; do a one-day spike on the Windows recogniser with Arabic before committing
to it.

## 5. Not in scope

- Judging handwriting quality or stroke order beyond "the recogniser read the same word".
- Parsing Arabic grammar automatically (the i‘rāb tree sets up nodes; the learner labels them).
- Collaboration on one sheet (sync means *your* devices).
- Notion / Obsidian (parked until the user asks).

## 6. Open questions

1. Which devices matter most for pen work: Windows with a pen, iPad, or Android tablets? It decides the order of 4, 5
   and 8.
2. Should recognised handwriting ever leave the device? (Proposed: never; on-device recognisers only.)
3. Gestures (B): on by default with Write, or opt-in? (Proposed: opt-in.)
4. Do sketch cards (D) count toward the daily review goal like word cards?
5. Writing practice (E): Naskh only, or Ruq‘a too (the everyday handwriting style)?
