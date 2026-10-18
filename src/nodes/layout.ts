import type { Kid, NodeKid } from './types';
import { kidOff } from './types';

/**
 * Where everything attached to a node goes. Pure geometry, in CSS pixels, with the top-level node at (0, 0).
 *
 * A branch node opens as a tree that grows away from the nearer page edge: a column of children per level
 * (DX apart), each child on its own row (PITCH apart), a parent level with the middle of its children. A reticle node
 * below the top opens as a panel at its own dot instead, so in a tree it takes one row and its children are not laid out.
 * A hand-placed offset shifts a node from its laid-out place, and what hangs from it moves along.
 */
export const PITCH = 46;
export const DX = 124;

export type Side = 1 | -1;

/** Which way things grow from a point at `x` on a page `width` wide: toward the side with more room. */
export const growSide = (x: number, width: number): Side => (x > width / 2 ? -1 : 1);

/** Is this a leaf in a tree: closed, empty, a card, or a reticle node below the top? */
export const isLeaf = (k: Kid, depth: number): boolean =>
  k.type === 'card' || !k.node.open || !k.kids.length || (depth > 0 && k.node.style === 'reticle');

export interface Placed {
  kid: Kid;
  depth: number;
  x: number;
  y: number;
  /** Index (in the returned list) of the one it hangs from; null for the top-level node. */
  parent: number | null;
}

const rows = (k: Kid, depth: number): number => (isLeaf(k, depth) ? 1 : (k as NodeKid).kids.reduce((s, c) => s + rows(c, depth + 1), 0));

/** The top-level node and everything shown below it, parents before children. */
export function layoutBranch(root: NodeKid, side: Side): Placed[] {
  interface Tmp {
    kid: Kid;
    depth: number;
    y: number;
    children: Tmp[];
    cx: number;
    cy: number;
  }
  const go = (kid: Kid, depth: number, top: number, parent: Tmp | null): Tmp => {
    // A hand-placed shift adds up down the tree, so a moved node takes its branch with it.
    const off = parent ? kidOff(kid) : undefined;
    const me: Tmp = { kid, depth, y: 0, children: [], cx: (parent ? parent.cx : 0) + (off?.x ?? 0), cy: (parent ? parent.cy : 0) + (off?.y ?? 0) };
    if (!isLeaf(kid, depth)) {
      let cur = top;
      for (const c of (kid as NodeKid).kids) {
        me.children.push(go(c, depth + 1, cur, me));
        cur += rows(c, depth + 1);
      }
      me.y = (me.children[0].y + me.children[me.children.length - 1].y) / 2;
    } else me.y = (top + 0.5) * PITCH;
    return me;
  };
  const tree = go(root, 0, 0, null);
  const shift = tree.y;
  const out: Placed[] = [];
  const flatten = (t: Tmp, parent: number | null) => {
    const at = out.length;
    out.push({ kid: t.kid, depth: t.depth, x: side * t.depth * DX + t.cx, y: t.y - shift + t.cy, parent });
    t.children.forEach((c) => flatten(c, at));
  };
  flatten(tree, null);
  return out;
}

/**
 * The nodes floated out of a reticle panel (they carry an offset): found through the rows that are open, since a
 * row that is closed hides what is inside it. A floated node is placed on the page, so its own contents are its own.
 */
export function floatedNodes(owner: NodeKid): NodeKid[] {
  const out: NodeKid[] = [];
  const walk = (n: NodeKid) => {
    for (const k of n.kids) {
      if (k.type !== 'node') continue;
      if (k.node.off) out.push(k);
      else if (k.node.open) walk(k);
    }
  };
  if (owner.node.open) walk(owner);
  return out;
}
