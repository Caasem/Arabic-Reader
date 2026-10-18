import { describeAnchor } from './anchor';
import { buildTree, countBelow, type Rows } from './model';
import type { NodeAnchor, NodeStyle } from './types';

/** One line of the node list: a top-level node of the book and where its home is. */
export interface ListEntry {
  id: string;
  title: string;
  style: NodeStyle;
  /** How many nodes and cards hang from it. */
  count: number;
  carried: boolean;
  anchor: NodeAnchor;
  /** "Page 7" or "Chapter 3". */
  where: string;
}

/** Position along the book, so the list reads in book order: PDF pages by page and height, then text by chapter and word. */
const placeKey = (a: NodeAnchor): [number, number, number] => (a.kind === 'pdf' ? [0, a.page, a.y] : [1, a.chapter, a.offset]);

/** Every top-level node that has a home, in book order. */
export function listEntries(rows: Rows): ListEntry[] {
  return buildTree(rows)
    .flatMap((k) => (k.node.anchor ? [{ k, anchor: k.node.anchor }] : []))
    .sort((a, b) => {
      const x = placeKey(a.anchor);
      const y = placeKey(b.anchor);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .map(({ k, anchor }) => ({
      id: k.node.id,
      title: k.node.title,
      style: k.node.style,
      count: countBelow(k),
      carried: !!k.node.carried,
      anchor,
      where: describeAnchor(anchor),
    }));
}
