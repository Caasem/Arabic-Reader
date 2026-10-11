# Write and Sketch, next level: change matrix

Follows `docs/features/ink-sketch-next.md`. One section per part of that plan that has landed. Everything is on
`refactor/integration`; each row says how to switch it off or take it back out.

## B. Gestures (0.98.0)

With Write on (Alt+W) and *Gestures* on, a finished stroke over the reader's text is checked: an underline, a circle
round one word, or a circle followed by a tick acts instead of being saved as ink. Anything else is ink as before.
Thresholds are named constants at the top of `src/annotate/gestures.ts`, in word heights.

| Change | Why | Before | After | Files | Off switch / revert |
|---|---|---|---|---|---|
| Stroke classifier | Recognise a gesture from the stroke and the word boxes near it, with no DOM, so it can be tested | No gestures | `classifyStroke` returns underline (chapter, start, end), circle (the word) or tick, else null. Underline: at least 1.2 word heights long, wobble at most 0.45, 85% of movement one way, on the lower part of the words, covering half of each. Circle: turns at least 270 degrees one way, ends meet within 35% of its diameter, round, fully round one word. Tick: a short V, second leg longer, rising at least 0.3 | `src/annotate/gestures.ts`, `gestures.test.ts` | Revert the commit. Nothing calls it with the setting off |
| Gestures setting | Opt in, because writing can look like a gesture | — | *Gestures* toggle in Settings → Ink and sketches (`inkGesturesEnabled`, default off) | `src/annotate/AnnotateSettings.tsx`, `src/types/preferences.ts`, `src/state/defaultPreferences.ts` | Turn it off in Settings; or revert the commit |
| Underline highlights | Mark a passage without selecting it | A line under words was just ink | A highlight over those words (yellow; green for teal ink, red for red ink), made the same way as any highlight, so it is stored, listed and synced like one. Toast *Highlighted* with Undo (removes the highlight, keeps the stroke as ink) | `src/annotate/CleanInk.tsx`, `src/annotate/useInkDraw.ts` (`gesture` hook on the surface), `src/readerChords/readerMarks.ts` (`addHighlight` on `ReaderMarks`), `src/quietReader/QuietReader.tsx` (implements it) | Gestures off |
| Circle looks up | Look a word up without lifting the pen | A circle was just ink | Clicks the circled word, so the dictionary popup opens as for a tap. Toast *Looked up ...* with Undo (keeps the stroke as ink; the popup stays) | `src/annotate/CleanInk.tsx` | Gestures off |
| Circle then tick saves | Save a word from the pen | A tick was just ink | A tick within 1.5 s and 3 word heights of the circle double-clicks the word, the same save as a double click (with its sentence). The reader's own *Saved* note and its Undo handle taking it back; the tick is not kept as ink | `src/annotate/CleanInk.tsx` | Gestures off |

Not done: bracket notes and strike-through (left out on purpose); PDF pages (their word finding is a separate
path, `src/pdf/pages/wordAtPoint.ts`, and was not wired); a toast for the tick of its own (the reader's quick-save
toast stands in).

## D. Sketches you review (0.99.0)

Flashcards from diagram sheets, image occlusion, and a practice walk-through. Cards are the existing hand-written
cards (`custom: true`), so there is no new table and no schema change: one optional field,
`VocabularyItem.sketch = { sketchId, nodeIds, occlude? }`. All the logic (card text, targets, tree order, hiding a
label) is in `src/annotate/sketchCards.ts` with tests in `sketchCards.test.ts`.

| Change | Why | Before | After | Files | Off switch / revert |
|---|---|---|---|---|---|
| Card logic | Test the rules without a screen | Nothing | `cardFromNodes` (front = first selected node, back = its children in edge order, else the other selected nodes; empty back refused with a reason), `occlusionTargets` (selected labelled nodes, else all, in tree order), `occlusionCard` (text fallback: "?", sheet name, parent; back = the label), `treeOrder` (roots top to bottom, children in edge order, every node once, loops end), `walkOrder`, `hiddenFor`, `hiddenAfter` | `src/annotate/sketchCards.ts`, `src/annotate/sketchCards.test.ts` | Revert the commit |
| Hidden labels in the sheet picture | Occlusion and the walk-through need a sheet with a blank box | `sketchSvg(sheet)` drew every label | `sketchSvg(sheet, { hide })` draws a dashed blank box for each hidden node | `src/annotate/toMargin.ts` | Revert the commit |
| `sketch` on cards | A card remembers its sheet | Custom cards had no link to a sheet | Optional `sketch` field; `saveCustomCard` takes it and, for sheet cards, does not mark the front as a saved word. Anki: the note's Source says "Sketch". No picture in Anki yet (it would need the sheet as a PNG media upload; `svgToPng` exists in `toMargin.ts`, so it is a small addition later) | `src/types/vocabulary.ts`, `src/vocabulary/vocabularyService.ts`, `src/anki/noteType.ts` | Revert the commit; cards made stay as plain text cards |
| Make card | A node and its children are a question and an answer | Cards were typed by hand (Alt+F) | **Make card** in the diagram toolbar; disabled with the reason as its hint; toast *Card made* with Undo (removes the card) | `src/annotate/SketchPanel.tsx`, `src/annotate/sketchSurface.ts` (`selectedIds`) | Revert the commit; Undo removes a card |
| Make occlusion cards | Learn a tree by recalling one label at a time | No | Sheet ⋯ menu, **Make occlusion cards**: a card per selected node, or per labelled node (confirm above 20); toast with Undo for the batch | `src/annotate/SketchPanel.tsx` | Revert the commit; Undo removes the batch |
| Review draws the sheet | See the diagram, not just words | Review showed text only | An occlusion card shows the sheet (label hidden on the front, shown on the back) when the sheet is on this device, else its text; **Open sheet** opens the book and that sheet (PDF places become `pdf:page=N`). Make-card cards stay text, since their front would show the answer | `src/components/review/Review.tsx`, `Review.css`, `src/annotate/sketchCardView.tsx` (loaded on demand), `src/App.tsx` | Revert the commit |
| Review sheet | Practise a whole diagram | No | Sheet ⋯ menu, **Review sheet**: labels hidden, Space/Enter/tap reveals the next in tree order, Backspace goes back, Esc ends; no grading, nothing saved | `src/annotate/SheetWalk.tsx`, `src/annotate/SketchPanel.tsx`, `src/annotate/annotate.css` | Revert the commit |

Not done: sheets do not sync yet, so on another device a sketch card is its text; the Anki note has no picture;
cards made with Make card never show the picture.
