# Shared Focus, one tool list, sketch to the margin: change matrix

From the Sketch Margin and PDF Focus prototype ([artifact](https://claude.ai/artifact/Duj9LMVPFY5vghUfH6XbEW)). Branch `feat/shared-focus`, on top of v0.72.2 (PR #58, the ink fixes, merged first).

**To reverse:** each phase is one commit. `git revert 1b80ad4` removes sketch to the margin only. `git revert 1b80ad4 4146702` removes both phases (revert newest first). No database version changes, so nothing stored needs migrating either way; desk items made by "To margin" keep working as plain screenshots and notes after a revert (their `sketchId` field is ignored).

## Phase 1: shared Focus and one tool list (0.73.0, commit `4146702`)

| # | What changed | Before | After | Why | Files | To reverse just this row |
|---|---|---|---|---|---|---|
| 1 | One Focus state | The quiet reader kept its own `focus` state; PDF pages had no Focus | `src/readerTools/focus.ts` holds Focus for every reader, still saved in the same `arabic-reader:cleanFocus` key | One switch, so both readers behave the same and a book opens in Focus if you left it there | `src/readerTools/focus.ts` (new); `src/quietReader/QuietReader.tsx` (`useState(loadCleanFocus)` → `useReaderFocus()`, `setFocus` → `setReaderFocus`, `saveCleanFocus` call removed: the store saves) | Put back `const [focus, setFocus] = useState(loadCleanFocus)` and the `saveCleanFocus(focus)` line in QuietReader |
| 2 | F key | Focus only from the dock button | F enters and leaves Focus in the reader and on PDF pages (not while typing or with a popup or palette open) | Focus needed a key, and PDF pages had no dock | `src/readerTools/FocusHost.tsx` | Delete the `KeyF` branch in FocusHost |
| 3 | Pill | Quiet reader pill: "Focus · Esc or Leave focus" | One pill for both readers: "Focus · where you are · Alt Alt tools", Tools, Leave focus; fades after 2.6 s still, back on any move | Show where you are, and the way to the tools, the same everywhere | `src/readerTools/FocusHost.tsx`, `readerTools.css`; `src/quietReader/Chrome.tsx` (`FocusPill` removed), `QuietReader.tsx` (its render removed, `setFocusWhere(whereLabel)` added) | Restore `FocusPill` in Chrome.tsx and `{focus && <FocusPill …/>}` in QuietReader |
| 4 | Tool rail | None | Alt pressed twice, or Tools: a rail at the left with every tool, grouped (reading, desk, ink), each with its key, switches showing on/off | Every feature reachable in Focus without leaving it | `src/readerTools/FocusHost.tsx` (`FocusRail`), `readerTools.css` | Remove `FocusRail` and the Alt-Alt handler |
| 5 | One tool list | Each feature put its own buttons into the dock's empty slot `#qr-dock-extra` by polling for it every 500 ms (desk: DeskSwitch; ink: InkSwitch) | `registerReaderTool()` in `src/readerTools/tools.ts`; the dock (`DockTools`), the PDF top bar and the rail draw from it | New features appear in every bar at once; no polling | `src/readerTools/tools.ts` (new); `src/quietReader/Chrome.tsx` (`ITEMS` exported as `DOCK_ITEMS`; slot `<span id="qr-dock-extra">` → `<DockTools labels={labels} />`) | Put the slot span back in Chrome.tsx and restore DeskSwitch.tsx / InkSwitch.tsx from git |
| 6 | Quiet reader's own buttons in the list | Contents, Search, Marks, Words, Display, Levels, Timer only in the dock | Also registered as `read` tools (so the rail has them); the dock still draws them itself as before | Reach drawers and sheets from Focus | `src/quietReader/QuietReader.tsx` (one effect registering `DOCK_ITEMS` except Focus) | Delete that effect |
| 7 | Drawers and sheets in Focus | Hidden in Focus (`chrome &&` on each); entering Focus closed them | They open in Focus too (from the rail); entering Focus still closes them | The rail opens them; they must show | `src/quietReader/QuietReader.tsx` (`chrome &&` removed from the drawer, levels, Display and Timer renders and from `padL` / `padR`) | Put `chrome &&` back on those five lines |
| 8 | Study desk switch | `DeskSwitch.tsx`: Margins and Document in the dock slot; in Focus a separate "Margins stay · Margins · Document" pill beside the Focus pill | `deskTools.tsx` registers Margins (Alt+M, on/off), Document (D) and Capture (Alt+X, not in the dock: no room) | Same buttons, now in the dock, the PDF bar and the rail | `src/studyDesk/deskTools.tsx` (new), `DeskSwitch.tsx` (deleted), `DeskHost.tsx` (`<DeskSwitch>` → `useDeskTools(...)`) | `git checkout 6f46ff6 -- src/studyDesk/DeskSwitch.tsx`, swap the line back in DeskHost |
| 9 | Ink switch | `InkSwitch.tsx` in the dock slot; Write and Sketch buttons drawn by the ink's PDF toolbar | AnnotateHost registers Write (Alt+W) and Sketch (Alt+K); the PDF toolbar extension only reports the page | Same reason as row 8 | `src/annotate/AnnotateHost.tsx`, `InkSwitch.tsx` (deleted), `PdfInk.tsx` (`PdfInkToolbar` draws nothing), `annotate.css` (`.ink-tbtn` removed) | Restore InkSwitch.tsx and the old PdfInkToolbar from git |
| 10 | PDF top bar | Zoom, then Write and Sketch, then Reflowed text | Zoom, then the shared desk and ink tools (Margins, Document, Capture, Write, Sketch), Focus, Reflowed text | The PDF view gets the desk tools and a way into Focus | `src/readerTools/FocusHost.tsx` (`PdfToolsBar`, a pages-view toolbar extension) | Remove the `registerPdfPageExtension({ id: 'reader-tools' … })` line |
| 11 | PDF Focus | — | Body class `rt-focus--pdf` hides `.reader__topbar` and `.reader__footer`; the app's sidebar hides as in the reader | Room for the page | `src/readerTools/readerTools.css`, `FocusHost.tsx`; mounted by `src/cleanReader/ReaderSwitch.tsx` (`<FocusHost reader="pdf" onChromeHidden={…} />` and `<FocusHost reader="clean" />`) | Remove the two `<FocusHost>` lines from ReaderSwitch (Focus then only exists in the quiet reader, without the pill: revert rows 1–3 too) |
| 12 | Esc in Focus | Popup → selection → drawer → … → leave Focus (quiet reader) | Popups, the ink bar and the sketch panel first; then the rail; then the quiet reader's own order; on PDF pages Esc then leaves Focus | The rail and PDF Focus needed a place in the order | `src/readerTools/FocusHost.tsx` | — |
| 13 | Tests | e2e looked for `.qr-focus-pill` and the desk's "Margins stay" pill | Look for the Focus group and the rail; new `e2e/shared-focus.spec.ts` (2 tests) | Follow rows 3 and 8 | `e2e/new-reader.spec.ts`, `e2e/study-desk.spec.ts`, `e2e/shared-focus.spec.ts` | Revert with the commit |

## Phase 2: sketch to the margin (0.74.0, commit `1b80ad4`)

| # | What changed | Before | After | Why | Files | To reverse just this row |
|---|---|---|---|---|---|---|
| 14 | To margin menu | The sketch stayed in its panel | "To margin ▾" in the panel head (only with the study desk on): whole sheet as a picture, whole sheet as an outline, or the selected node | Put the sketch where the rest of the notes are | `src/annotate/SketchPanel.tsx`, `annotate.css` (`.sk-send`) | Remove the `prefs.studyDeskEnabled && (…)` block |
| 15 | Picture card | — | A desk item of type `capture` with a PNG of the sheet (BlobStore namespace `desk`), pinned beside the sheet's page (PDF, 10% down) or the first line of its passage; it is drawn again each time the sheet is saved | Behaves like screenshots: hover preview, document, export | `src/annotate/toMargin.ts` (`sendSketchToMargin`, `sketchPng`, `sketchSvg`, `refreshSketchCards`), `SketchPanel.tsx` (refresh after save) | — |
| 16 | Outline and node notes | — | Margin notes (type `line`) whose lines are the diagram (arrows indented "→") or one node's words. These are copies: later edits to the sheet do not change them | Readable at a glance; editable like any note | `src/annotate/toMargin.ts` (`sketchOutline`) and test | — |
| 17 | `sketchId` on desk items | — | Optional field on `DeskItem` | Lets the card open its sheet and be redrawn | `src/studyDesk/types.ts` | Remove the field (old items keep it harmlessly) |
| 18 | Card label and Open sketch | Screenshot / note labels | "Sketch" (picture) or "From sketch" (notes), and an Open sketch button that opens the panel on that sheet | Find the sheet again from the margin | `src/studyDesk/MarginLayer.tsx` (`kind`, the button dispatching `annotate:open-sketch`), `marginLayer.css` (`.sd-gloss__open`); `src/annotate/AnnotateHost.tsx` (listener), `inkUi.ts` (`openSketch`), `SketchPanel.tsx` (shows that sheet) | Remove the button block in MarginLayer |
| 19 | Selected node known to the panel | — | `SurfaceState.node` | For "Selected node only" | `src/annotate/sketchSurface.ts` | — |
| 20 | Tests | — | `toMargin.test.ts` (outline, pin, SVG); e2e "a sketch goes to the margin as a picture card that opens its sheet again" | — | `src/annotate/toMargin.test.ts`, `e2e/annotate.spec.ts` | Revert with the commit |

## Prototype against the app

| Prototype element | In the app? | Notes |
|---|---|---|
| F, pill, Alt-Alt rail, Esc | Yes | As in the prototype, in both readers |
| Rail lists every tool | Yes | Contents, Search, Marks, Words, Display, Levels, Timer (reader only), Margins, Document, Capture, Write, Sketch. Highlight and zoom are not in the rail: highlighting is a drag on the page, zoom stays on the keyboard and in the bar |
| Top bar peeks back at the top edge | **No** | The pill comes back on any move instead; the bar itself stays hidden until Focus ends |
| Page chip while scrolling, progress line in PDF Focus | **No** | The pill already says the page; the quiet reader keeps its progress line |
| Sketch picture card, hover preview | Yes | Uses the desk's screenshot card and preview |
| Outline card | Yes, as a note | A plain margin note with the outline as its lines (handwriting noted as "+ N handwritten marks"), not a separate card style |
| "Pick the line it sits beside" | **No** | Cards sit at the sheet's own place; drag the card to another line as with any margin card |
| Live link | Picture only | Outline and node notes are copies, so your edits to them are never overwritten |

## Known limits

- The PNG of a sheet uses the system's fonts (an image cannot load the app's web fonts), so Arabic in node labels may look slightly different on the card.
- With the study desk switched off, To margin is hidden.
- Focus in the original epub layout is unchanged (it has its own button that switches to the reader).
