/**
 * Ink and sketches (docs/features/annotate.md): writing and drawing straight on a book's pages, and a sketch
 * sheet beside them with freehand and diagram modes. Everything is stored per book and per place so it comes
 * back where it was made.
 */

export type InkTool = 'pen' | 'marker';
export type InkColor = 'ink' | 'brown' | 'teal' | 'red';
/** x, y and pen pressure (0-1; a mouse reports 0.5). */
export type InkPoint = [number, number, number];

/**
 * One stroke written on a page.
 *
 * PDF pages (`key` "pdf:<page>"): points are in page units, the page being 1000 wide at every zoom.
 * Clean text (`key` "clean:<chapter>"): the stroke is tied to a word, the one at `offset` characters into the
 * chapter, and its points are in em from that word's top, reading-start corner. When the text reflows (a
 * different font size, window width, or columns) the stroke moves with its word and scales with the text.
 */
export interface InkStroke {
  id: string;
  bookId: string;
  key: string;
  /** Clean text only: the word the stroke is tied to. */
  offset?: number;
  tool: InkTool;
  color: InkColor;
  /** Line width, in the same units as the points. */
  width: number;
  pts: InkPoint[];
  createdAt: number;
  updatedAt: number;
}

export interface SketchStroke {
  id: string;
  color: InkColor;
  width: number;
  pts: InkPoint[];
  /** Written with the marker: wide and see-through. */
  marker?: boolean;
}

export type SketchNodeKind = 'plain' | 'note' | 'quote' | 'image';

export interface SketchNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  kind: SketchNodeKind;
  /** A quote's (or picture's) place in the book (a clean or PDF place, as highlights store them). */
  location?: string;
  /** The study desk item it was quoted from (a highlight on a PDF page), which shows it is in a sketch. */
  deskItemId?: string;
  /** A picture node: the region of the page, as a data URL. */
  image?: string;
  /** A tint for the box (a #rrggbb colour), unset for the plain box. */
  color?: string;
}

export interface SketchEdge {
  id: string;
  a: string;
  b: string;
  /** An arrow from a to b; otherwise a plain line. */
  dir: boolean;
}

/** What a sheet belongs to: the place it was started at, a range of pages (PDF) or chapters (reader), or the book. */
export type SketchScope = { kind: 'place' } | { kind: 'range'; from: number; to: number } | { kind: 'book' };

/**
 * A sketch sheet: freehand strokes and a diagram of nodes and connectors on one surface. Coordinates are the
 * sheet's own (CSS pixels at 100%), so the panel's size and zoom never move what is on it.
 */
export interface Sketch {
  id: string;
  bookId: string;
  /** "pdf:<page>" or "clean:<chapter>": which part of the book it belongs to. */
  key: string;
  /** The place it was started at: "pdf:<page>" or a clean place "clean:<chapter>:<start>:<end>" (the passage then on screen). */
  location: string;
  mode: 'draw' | 'diagram';
  /** Its name on its tab ("Sheet 2" until renamed). */
  title?: string;
  /** Unset: the place it was started at. */
  scope?: SketchScope;
  /** Closed: not a tab any more, still in All sheets. */
  hidden?: boolean;
  /** Its place among the tabs; unset sorts by when it was made. */
  order?: number;
  view: { tx: number; ty: number; s: number };
  strokes: SketchStroke[];
  nodes: SketchNode[];
  edges: SketchEdge[];
  createdAt: number;
  updatedAt: number;
}
