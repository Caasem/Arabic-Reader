# Nodes: change matrix

Built from the node prototype ([artifact](https://claude.ai/artifact/3JgEMySJcAkYG73RtMkbot)). One commit per stage on `feat/nodes`. To remove a stage, revert its commit (from the bottom up). To switch the feature off without code changes: Settings → Nodes (`nodesEnabled`).

New code lives in `src/nodes/` only. Touch points outside it are listed in `nodesFeature` (`src/nodes/index.ts`).

## Stages

| Stage | Version | What it adds | Existing files touched | Switch | Revert notes |
|---|---|---|---|---|---|
| 1. Data | (no UI) | Own database `arabic-reader-nodes` (nodes, cards), the tree logic (nest, detach, restyle, delete), the branch layout with hand-placed offsets, anchor arithmetic for clean text and PDF pages | `src/storage/registry.ts` (NODES_DB, two tables); `src/dataExport/stores.ts` (both tables in export and import); `src/types/preferences.ts`, `src/state/defaultPreferences.ts` (`nodesEnabled`, `nodesDefaultStyle`) | — | The database stays in the browser untouched after a revert. |
| 2. The dot | 0.113.0 | Add a node anywhere (Alt+O), drag it, tap to open and collapse, title on hover or pinned, both looks drawn; settings; registered feature | `src/features/registry.ts` and its test (one host, one settings section); `package.json`, `package-lock.json`, `VERSION`, `CHANGELOG.md` | `nodesEnabled` | Nodes already made stay in the database. |

## How it fits the app

- **Placement.** Same technique as the ink layer: a fixed layer over the reader's stage (`.qr-stage` for the quiet reader, `.pdfp__stage` for PDF pages) that lets every touch through except those on a node. A clean-text node is tied to the nearest word (chapter + character offset) and sits at an offset in em from that word's reading-start corner; a PDF node is a page number and x/y in page units (a page is 1000 wide at every zoom; margins are outside 0–1000).
- **Tools.** One tool in the shared dock and Focus rail (`registerReaderTool`), chord Alt+O.
