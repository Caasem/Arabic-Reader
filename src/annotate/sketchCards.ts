import type { Sketch, SketchNode } from './types';

/**
 * Sketches you review (docs/features/ink-sketch-next.md, D): flashcards made from a diagram sheet. The cards are
 * ordinary hand-written cards (`custom: true`, so FSRS, the review screen, sync and Anki come with them); a
 * `sketch` field on the card says which sheet and nodes it came from. This file is the logic only: building
 * what goes on a card, choosing what to hide, and the order of the walk-through. No storage, no screen.
 */

type Graph = Pick<Sketch, 'nodes' | 'edges'>;

/** The data a card keeps about its sheet (VocabularyItem.sketch). */
export interface SketchCardRef {
  sketchId: string;
  nodeIds: string[];
  /** The node whose label is hidden on the front. */
  occlude?: string;
}

/** What a new card says and points at. */
export interface SketchCardSpec {
  front: string;
  back: string;
  sketch: SketchCardRef;
}

/** More cards than this at once are confirmed first. */
export const OCCLUSION_CONFIRM_ABOVE = 20;

const words = (n: SketchNode | undefined) => (n?.text ?? '').replace(/\s+/g, ' ').trim();
const byPlace = (a: SketchNode, b: SketchNode) => a.y - b.y || a.x - b.x;

/** The nodes a node points to (an edge drawn from it), in the order the edges were drawn. */
export function childrenOf(s: Graph, id: string): SketchNode[] {
  const out: SketchNode[] = [];
  for (const e of s.edges) {
    if (e.a !== id || e.b === id) continue;
    const n = s.nodes.find((x) => x.id === e.b);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The node an edge points from into this one (its parent), if any. */
export function parentOf(s: Graph, id: string): SketchNode | undefined {
  const e = s.edges.find((x) => x.b === id && x.a !== id);
  return e && s.nodes.find((n) => n.id === e.a);
}

/**
 * Every node once, in the order a tree is read: roots (no arrow into them) from top to bottom, each followed by
 * its children in the order their edges were drawn. Nodes only reachable through a loop come last, each as a
 * root of its own, so a cycle ends instead of looping.
 */
export function treeOrder(s: Graph): string[] {
  const hasParent = new Set(s.edges.filter((e) => e.a !== e.b).map((e) => e.b));
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (n: SketchNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n.id);
    for (const k of childrenOf(s, n.id)) walk(k);
  };
  const sorted = [...s.nodes].sort(byPlace);
  for (const n of sorted) if (!hasParent.has(n.id)) walk(n);
  for (const n of sorted) walk(n);
  return out;
}

/**
 * A card from selected nodes. Front: the first selected node's words (the parent). Back: its children's words, in
 * order; with no children, the other selected nodes' words. An empty back is refused, with the reason.
 */
export function cardFromNodes(s: Sketch, ids: string[]): { ok: true; spec: SketchCardSpec } | { ok: false; why: string } {
  const picked = ids.map((id) => s.nodes.find((n) => n.id === id)).filter((n): n is SketchNode => !!n);
  const first = picked[0];
  if (!first) return { ok: false, why: 'Select a node first' };
  const front = words(first);
  if (!front) return { ok: false, why: 'The node has no words to ask about' };
  let back = childrenOf(s, first.id).map(words).filter(Boolean);
  if (!back.length) back = picked.slice(1).map(words).filter(Boolean);
  if (!back.length) return { ok: false, why: 'Needs an answer: connect child nodes to it, or select more nodes' };
  return { ok: true, spec: { front, back: back.join('\n'), sketch: { sketchId: s.id, nodeIds: picked.map((n) => n.id) } } };
}

/** Whether a node has a label that can be hidden. */
export const hasLabel = (n: SketchNode): boolean => !!words(n);

/** The nodes to make occlusion cards for: the selected labelled ones, or every labelled node, in tree order. */
export function occlusionTargets(s: Sketch, selected: string[]): string[] {
  const labelled = new Set(s.nodes.filter(hasLabel).map((n) => n.id));
  const chosen = selected.length ? new Set(selected) : null;
  return treeOrder(s).filter((id) => labelled.has(id) && (!chosen || chosen.has(id)));
}

/** The card for hiding one node: shown as the sheet with that label blank; as text when the sheet is not here. */
export function occlusionCard(s: Sketch, name: string, id: string): SketchCardSpec | null {
  const node = s.nodes.find((n) => n.id === id);
  if (!node || !hasLabel(node)) return null;
  const parent = words(parentOf(s, id));
  return {
    front: ['?', name, parent].filter(Boolean).join('\n'),
    back: words(node),
    sketch: { sketchId: s.id, nodeIds: [id], occlude: id },
  };
}

/** The labels to hide for a card's front (the occluded node) or back (none). */
export function hiddenFor(ref: SketchCardRef, side: 'front' | 'back'): ReadonlySet<string> {
  return side === 'front' && ref.occlude ? new Set([ref.occlude]) : new Set();
}

/** The walk-through: the labelled nodes in tree order. Step `n` has revealed the first `n` of them. */
export function walkOrder(s: Graph): string[] {
  const labelled = new Set(s.nodes.filter(hasLabel).map((n) => n.id));
  return treeOrder(s).filter((id) => labelled.has(id));
}

/** Labels hidden after `revealed` steps of the walk-through. */
export function hiddenAfter(order: string[], revealed: number): ReadonlySet<string> {
  return new Set(order.slice(revealed));
}
