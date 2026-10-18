# Nodes: dots placed anywhere on a page, with things attached

Roadmap id: `nodes` · Area: Reader experience · Status: built locally (branch `feat/nodes`) · Depends on: nothing · Prototype: [artifact](https://claude.ai/artifact/3JgEMySJcAkYG73RtMkbot) · Change matrix: [nodes-changes.md](../changes/nodes-changes.md)

## 1. Purpose

Highlights and margin cards are tied to a line of text or to a side of the page. A reader sometimes wants to put a mark exactly where it belongs, in the text or out in a margin, and hang things from it that can be folded away: a note, a quote, a flashcard, another mark. A **node** is that mark: a small dot you drop anywhere, drag anywhere, and tap to open or collapse.

## 2. Expected behaviour

- **Place.** Alt+O (or *Node* in the dock), then tap the page. The node appears with its title ready to type. It can sit on the text or in a margin; nothing snaps to a line.
- **Move.** Drag its dot anywhere. In the quiet reader it is tied to the nearest word and moves with the text when it reflows or the font changes; on PDF pages it keeps its place on the page at every zoom.
- **Open and collapse.** Tap the dot. An open node shows what is attached to it; a closed one is only the dot. Hover a closed dot to see its title; pin the title to keep it.
- **Two looks, chosen per node.** *Reticle*: a bracketed diamond that opens a side panel with an outline. *Branch*: a bead that opens a tree growing away from the nearer page edge. The default for new nodes is a setting; any node can be switched later. A reticle can hold a branch and a branch can hold a reticle.
- **Attach.** An open node's controls attach a note (opens for typing) or a branch (a node inside the node). Cards and notes edit on double-click: Enter saves, Esc cancels, emptying one deletes it.
- **Nest by dragging.** Drop a node or card on another node (its dot or open panel) to put it inside. Drop it back on the node it came from to return it. Alt-drag, or *Detach*, frees a nested node as a node of its own.
- **Space out.** Dragging a nested node, or a card in a branch, moves it by hand while it stays attached (a thin line follows). In a branch it nudges the node and what hangs from it; in a reticle panel it floats out of the outline, tied to the panel's dot.
- **Carry.** *Carry* makes a node follow you from page to page with its contents; a faint ring marks where it belongs while that page is on screen. *Put down here* makes the page you are on its new home; *Send back home* stops carrying.
- **List.** Alt+Shift+O (or *Nodes* in the dock) lists every node in the book in book order. Tap one to go to its home; *Bring here* carries it to the page you are reading.
- **Delete** a node (with everything attached to it) from its controls; *Undo* appears for a few seconds.

## 3. User flows

1. Reading a chapter → Alt+O, tap in the margin by a paragraph → type "Argument" → attach three notes → collapse it.
2. Later, on another chapter that argues the same point → Alt+Shift+O → *Bring here* on "Argument" → the node, with its notes, sits beside this page → *Put down here*.
3. A node with ten cards crowds the page → switch it to a branch; drag two cards out to give them room; the rest stays put.

## 4. UI

- One tool in the shared dock and Focus rail (`registerReaderTool`), chord Alt+O; a second for the list, Alt+Shift+O. Settings → Nodes switches the feature off and sets the default look.
- Colours come from the app's tokens (the brass accent is the node colour); no new palette.
- Controls on a node appear only while it is open, so a closed or pinned node is just its dot and title.

## 5. Data

Class A (user records), local only until sync covers it. Own database `arabic-reader-nodes` with two flat tables so the tree is rebuilt in memory and rows can merge one by one later:

| Table | Row | Key fields |
|---|---|---|
| `nodes` | a node | `bookId`, `parentId` (null: top-level), `title`, `style`, `open`, `pinTitle`, `anchor` (top-level), `carried` and `carryAt` (top-level), `off` (nested), `order` |
| `cards` | a note, quote, card, ink or question | `bookId`, `parentId` (a node), `kind`, `text`, `off`, `order` |

An `anchor` is `{kind: 'clean', chapter, offset, dx, dy}` (the word at `offset` characters into the chapter, then `dx`/`dy` in em from its reading-start corner) or `{kind: 'pdf', page, x, y}` (page units, a page being 1000 wide). Declared in `src/storage/registry.ts` and the full export (`src/dataExport/stores.ts`, newer-wins by `updatedAt`).

## 6. Technical notes

- Everything is in `src/nodes/`; `nodesFeature` (`src/nodes/index.ts`) lists the touch points. To remove the feature, delete the folder, its registry line and those touch points.
- Pure logic with unit tests: `model.ts` (tree, nest, detach, restyle, delete), `layout.ts` (the branch layout and hand-placed offsets), `anchor.ts` (anchor arithmetic), `listEntries.ts`. `NodeView.tsx` is presentational (it marks controls with `data-nx-*`); `NodesLayer.tsx` and `useNodeDrag.ts` own the listening.
- The layer is a fixed element the size of the reader's stage (`.qr-stage` or `.pdfp__stage`) that lets every touch through except those on a node, as the ink layer does. It reads the readers' DOM only and edits neither.

## 7. Edge cases

- A node whose word is not on screen (a paged layout keeps other pages beside the column) is not drawn until its page shows.
- A node made in a book's text is not on its PDF pages, and the other way round; the list says so instead of jumping.
- Nesting a node into itself or its own branch is refused. Switching a node's look clears hand-placed offsets below it, because an offset means a nudge in a branch and a float in a panel.
- Typing in a title or card keeps the reader's own keys out of it.

## 8. Acceptance

- Place, drag, rename, collapse and reopen a node in the quiet reader; it keeps its place across a reload and follows its word when scrolling. (Checked in a browser.)
- Attach notes and branches, switch looks, nest, detach, space out, edit and delete with Undo. (Checked in a browser, except detach.)
- Carry across chapters, put down, and jump from the list. (Checked in a browser.)
- Unit tests cover the tree, layout, anchors, store, list order and rendering. **Not yet checked on PDF pages** (same layer and anchors, but not exercised in a browser) or on a phone.

## 10. Future extensions

- Attach existing study-desk items (a quote, a concept, a card) to a node by dragging them from the Ḥāshiya, and show nodes in the desk document and Word export.
- Drag a card between the outline rows of a reticle panel to float it, as nodes do.
- Right-click ring on a node (the Ḥāshiya's `MarginRing`) in place of the buttons.
- Sync (per-row, newer wins).
