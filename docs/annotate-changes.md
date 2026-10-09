# Ink and sketches: change matrix

Built from the Margin Canvas prototype ([artifact](https://claude.ai/artifact/JuFCffSbCnZp5RnGVeR7KL)). One commit per phase on `feat/margin-canvas`. To remove a phase, revert its commit (from the bottom up). To switch the feature off without code changes: Settings → Ink and sketches (`annotateEnabled`). Phase 3 (the highlight look) has no switch; revert its commit.

New code lives in `src/annotate/` only, plus `e2e/annotate.spec.ts`.

## Phases

| Phase | Version | What it adds | New files | Existing files touched | Switch | Revert notes |
|---|---|---|---|---|---|---|
| 1. Data | (no UI) | Own database `arabic-reader-ink` (strokes, sketches), store, geometry helpers, tests | `src/annotate/types.ts`, `db.ts`, `inkStore.ts`, `geometry.ts` and tests | `src/storage/registry.ts` (INK_DB, two tables); `src/dataExport/stores.ts` (both tables in export and import); `src/types/preferences.ts`, `src/state/defaultPreferences.ts` (`annotateEnabled`) | — | The database stays in the browser untouched after a revert. |
| 2. Write on the page, sketch beside it | 0.71.0 | Alt+W ink on PDF pages and over the quiet reader; ink bar; Alt+K sketch panel (freehand and diagram) | `AnnotateHost.tsx`, `CleanInk.tsx`, `PdfInk.tsx`, `InkBar.tsx`, `InkSwitch.tsx`, `SketchPanel.tsx`, `sketchSurface.ts`, `useInkDraw.ts`, `inkUi.ts`, `icons.tsx`, `annotate.css`, `AnnotateSettings.tsx`, `index.ts`; `e2e/annotate.spec.ts` | `src/cleanReader/ReaderSwitch.tsx` (mounts `<AnnotateHost>`, 2 lines); `src/components/shared/SettingsPanel.tsx` (adds `<AnnotateSettings>`, 2 lines); `package.json`, `package-lock.json`, `VERSION`, `CHANGELOG.md`. No PDF or reader code: PDF ink is a pages-view extension (`registerPdfPageExtension`), reader ink an overlay over `.qr-stage`, the dock buttons go in `#qr-dock-extra` | `annotateEnabled` | Ink and sketches already made stay in the database. |
| 3. Highlight look | 0.72.0 | Reading Graph's `.hl` look for PDF highlight boxes and the reader's yellow highlight | none | `src/studyDesk/pdfDesk.css` (`.sd-pdfbox`, `--on`, new `--noted`); `src/studyDesk/PdfDeskLayer.tsx` (adds `--noted` class, 1 line); `src/quietReader/quietReader.css` (`::highlight(qr-hl-yellow)` per theme); version files | none | Revert brings back the old yellow boxes (inset outline, 3px corners) and the old translucent yellow. |

## Prototype against the app

| Prototype element | In the app? | How it was integrated, or why not | Changed from the prototype |
|---|---|---|---|
| Write directly on the page | Yes | `CleanInk.tsx` over the quiet reader, `PdfInk.tsx` inside each PDF page frame | Reader strokes are tied to a **word** (character offset + em offset), not to the whole page as in the prototype, so reflow carries them along. The prototype's text-page drift is fixed. |
| Pen, marker, eraser, colours, widths, Undo/Redo, Done | Yes | `InkBar.tsx` | Marker is see-through ink (any colour) rather than gold-only. Undo history lasts the session, not across reloads. |
| Stylus pressure, palm rejection | Yes | `useInkDraw.ts`, `sketchSurface.ts` | Same rule: after a pen is seen, fingers scroll. Not tested on a real iPad yet. |
| Margin canvas tile (collapsed preview in the margin) | **No** | The quiet reader's margins belong to the study desk (cards, piles); a tile there would fight them | Replaced by **Write** and **Sketch** buttons in the dock (and in the PDF top bar). No preview thumbnail. |
| Margin canvas panel, Full size, Minimise | Yes | `SketchPanel.tsx`; the reader narrows beside it instead of being covered | Closes with Esc, the close button, or a still tap on the page (as in the prototype). |
| Freehand mode | Yes | `sketchSurface.ts` (plain TypeScript, ported from the prototype) | Same tools; one width scale shared with the page ink. |
| Diagram mode: nodes, connectors, arrows, move, resize, edit, zoom, pan | Yes | `sketchSurface.ts` | Same. Highlight-kind node renamed **Quote**, made from words selected on the page (the prototype added it from a highlight's pop-up). |
| One sheet per page | Yes, adapted | PDF: one per page. Reader: one per **passage** (the text on screen when it was started), since the reader has no fixed pages | The sheet follows the reader as you scroll or turn pages. |
| Highlights look (`.hl` from Reading Graph) | Partly | Phase 3 | PDF boxes: full look (colours, 6px corners, 4px room, outline, teal dot). Reader highlights: colours only; the browser's highlight API cannot draw rounded corners, outlines or the dot. Other colours (green, blue…) unchanged. |
| PDF text highlighting by selection | Already in the app | Study desk phase 18 (`PdfSelect.tsx`, snaps to words, OCR on scans) | Not rebuilt; only restyled. |
| Highlight pop-up with "Add to margin" | No | The study desk already offers Gloss in the margin, Send to inbox and a right-click ring on PDF boxes | Use **Quote** in the sketch panel instead. |
| Scanned-page region highlight | Already in the app | Study desk (drag on scanned pages, region kept when OCR finds nothing) | Restyled only. |
| Highlights list panel | Already in the app | The app's Highlights page and the desk inbox | Not duplicated. |
| Stored record viewer | No | A prototype-only aid | Data is in `arabic-reader-ink` and in the full export. |
| Reset sample data | No | Prototype only | — |
| Send to Notion / Obsidian | No (parked) | Requested for later | Formats were kept exportable (SVG paths, node and edge JSON, text places). |
| Snap grid | No | Ignored as asked | — |

## Known limits

- Reader ink is tied to the word it **starts** on. A long stroke across several lines keeps its shape, so after a big reflow its far end may no longer sit on the same words.
- In Focus the dock is hidden; Alt+W and Alt+K still work, but there is no on-screen button.
- Ink and sketches stay on this device (as the desk does) until sync covers them.
- Not checked on an iPad with an Apple Pencil, or on Android.
