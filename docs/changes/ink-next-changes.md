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
