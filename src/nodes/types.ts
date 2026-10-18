/**
 * Nodes (docs/features/nodes.md): small dots you place anywhere on a page or in its margins, and attach notes,
 * quotes, cards and other nodes to. Collapsing a node hides everything attached to it. Stored per book, as flat
 * rows (a row per node and per card) so the tree is rebuilt in memory and rows can merge one by one later.
 */

/** How a node opens: a side panel with an outline (reticle), or a tree that grows across the page (branch). */
export type NodeStyle = 'reticle' | 'branch';

export type CardKind = 'note' | 'quote' | 'card' | 'ink' | 'question';

/**
 * Where a top-level node is tied to the book. Both forms can lie outside the text (in a margin).
 * - clean text: the word at `offset` characters into the chapter, then `dx`/`dy` in em from that word's
 *   reading-start corner (right for Arabic), in screen directions. Reflowing the text, or changing the font
 *   size, moves the node with its word.
 * - PDF: the page, and x/y in page units (a page is 1000 wide at every zoom; the margins are below 0 or above 1000).
 */
export type NodeAnchor =
  | { kind: 'clean'; chapter: number; offset: number; dx: number; dy: number }
  | { kind: 'pdf'; page: number; x: number; y: number };

/** A hand-placed shift from where the layout would put something, in CSS pixels at normal size. */
export interface Offset {
  x: number;
  y: number;
}

/** A node: the dot, its title, and (through `parentId`) where it hangs. */
export interface NodeRec {
  id: string;
  bookId: string;
  /** The node it is attached to, or null for a top-level node (which has an `anchor`). */
  parentId: string | null;
  title: string;
  style: NodeStyle;
  /** Showing what is attached to it. */
  open: boolean;
  /** Keeps the title showing while it is closed (otherwise it shows on hover). */
  pinTitle: boolean;
  /** Top-level nodes only. */
  anchor?: NodeAnchor;
  /** Top-level nodes only: follows the reader from page to page instead of staying on its own page. */
  carried?: boolean;
  /** While carried: where it sits on screen, as a fraction of the reader's width and height. */
  carryAt?: { x: number; y: number };
  /**
   * Attached nodes only. In a branch it nudges the node (and what hangs from it) from its place in the layout; in a
   * reticle panel it floats the node out of the outline, still tied to the panel's dot and still counted as its child.
   */
  off?: Offset;
  /** Position among its siblings, nodes and cards together. */
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Something attached to a node: a note, a quote, a flashcard, ink, a question. */
export interface CardRec {
  id: string;
  bookId: string;
  parentId: string;
  kind: CardKind;
  text: string;
  /** Same meaning as `NodeRec.off`. */
  off?: Offset;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** The tree as the screen uses it. */
export type Kid = NodeKid | CardKid;
export interface NodeKid {
  type: 'node';
  node: NodeRec;
  kids: Kid[];
}
export interface CardKid {
  type: 'card';
  card: CardRec;
}

export const kidId = (k: Kid): string => (k.type === 'node' ? k.node.id : k.card.id);
export const kidOff = (k: Kid): Offset | undefined => (k.type === 'node' ? k.node.off : k.card.off);
