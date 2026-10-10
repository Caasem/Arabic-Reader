# Sketch, margin ink and collapsible cards: change matrix

Everything discussed on 2026-10-10 about the Highlighter, sketches beside PDF pages and the margins, built on
`feat/sketch-margin-next`. One commit per phase, each with its own version. To remove a phase, revert its commit
(newest first if later phases build on it). Rows say what changed, why, where, and how to switch it off.

| # | Phase | Version | Before | After | Why | Files | Off switch / revert |
|---|---|---|---|---|---|---|---|
| 1 | Highlighter on Night pages | 0.82.0 | On Night pages (inverted page image) a multiplied highlight barely showed | The layer screens on Night pages with the colour's dark twin; outlines lighter than the paper | Highlights must show on every page look | `src/studyDesk/highlighterColour.ts` (`highlighterNight`) and test, `PdfDeskLayer.tsx`, `pdfDesk.css` (`.sd-pdfdesk--night`), `e2e/study-desk.spec.ts` | Revert the commit |
