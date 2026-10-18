import { describe, expect, it } from 'vitest';
import { ancestorIds, buildTree, canNest, countBelow, deletionOf, detachNode, nestCard, nestNode, nextOrder, restyle, subtreeIds, topOf, type Rows } from './model';
import type { CardRec, NodeAnchor, NodeRec } from './types';

const anchor: NodeAnchor = { kind: 'pdf', page: 3, x: 100, y: 200 };
const node = (id: string, parentId: string | null, extra: Partial<NodeRec> = {}): NodeRec => ({
  id, bookId: 'b1', parentId, title: id, style: 'reticle', open: false, pinTitle: true, order: 0, createdAt: 1, updatedAt: 1,
  ...(parentId === null ? { anchor } : {}),
  ...extra,
});
const card = (id: string, parentId: string, extra: Partial<CardRec> = {}): CardRec => ({ id, bookId: 'b1', parentId, kind: 'note', text: id, order: 0, createdAt: 1, updatedAt: 1, ...extra });

//  a ── b ── d
//   │    └── c1 (card)
//   └─ c2 (card)      z (another top-level node)
const rows = (): Rows => ({
  nodes: [node('a', null), node('b', 'a', { order: 1 }), node('d', 'b'), node('z', null, { order: 1 })],
  cards: [card('c1', 'b', { order: 1 }), card('c2', 'a', { order: 0 })],
});

describe('buildTree', () => {
  it('nests nodes and cards under their parent, in order', () => {
    const [a, z] = buildTree(rows());
    expect(a.node.id).toBe('a');
    expect(z.node.id).toBe('z');
    // a's kids: the card c2 (order 0) then node b (order 1)
    expect(a.kids.map((k) => (k.type === 'card' ? k.card.id : k.node.id))).toEqual(['c2', 'b']);
    const b = a.kids[1];
    expect(b.type === 'node' && b.kids.map((k) => (k.type === 'card' ? k.card.id : k.node.id))).toEqual(['d', 'c1']);
  });

  it('leaves out rows that lead nowhere', () => {
    const r = rows();
    r.nodes.push(node('lost', 'missing'));
    const ids: string[] = [];
    const walk = (k: ReturnType<typeof buildTree>[number]) => {
      ids.push(k.node.id);
      k.kids.forEach((c) => c.type === 'node' && walk(c));
    };
    buildTree(r).forEach(walk);
    expect(ids).not.toContain('lost');
  });

  it('survives a loop between two nodes', () => {
    const loop: Rows = { nodes: [node('a', null), node('x', 'y'), node('y', 'x')], cards: [] };
    expect(() => buildTree(loop)).not.toThrow();
  });

  it('counts everything below a node', () => {
    expect(countBelow(buildTree(rows())[0])).toBe(4);
  });
});

describe('tree questions', () => {
  it('finds a subtree, the ancestors and the top-level node', () => {
    expect([...subtreeIds(rows(), 'a')].sort()).toEqual(['a', 'b', 'd']);
    expect(ancestorIds(rows(), 'd')).toEqual(['b', 'a']);
    expect(ancestorIds(rows(), 'a')).toEqual([]);
    expect(topOf(rows(), 'd')?.id).toBe('a');
    expect(topOf(rows(), 'z')?.id).toBe('z');
  });

  it('allows nesting anywhere except into itself or its own branch', () => {
    expect(canNest(rows(), 'a', 'z')).toBe(true);
    expect(canNest(rows(), 'a', 'a')).toBe(false);
    expect(canNest(rows(), 'a', 'd')).toBe(false);
    expect(canNest(rows(), 'd', 'a')).toBe(true);
    expect(canNest(rows(), 'a', 'nope')).toBe(false);
  });

  it('puts new things last', () => {
    expect(nextOrder(rows(), 'a')).toBe(2);
    expect(nextOrder(rows(), null)).toBe(2);
    expect(nextOrder({ nodes: [node('a', null)], cards: [] }, 'a')).toBe(0);
  });
});

describe('moving things', () => {
  it('nests a top-level node: it loses its anchor and its place on the page', () => {
    const moved = nestNode({ ...rows(), nodes: rows().nodes.map((n) => (n.id === 'z' ? { ...n, carried: true } : n)) }, 'z', 'a', 5);
    expect(moved).toMatchObject({ id: 'z', parentId: 'a', updatedAt: 5 });
    expect(moved).not.toHaveProperty('anchor');
    expect(moved).not.toHaveProperty('carried');
    expect(moved!.order).toBe(2);
  });

  it('keeps the node open or closed as it was, and drops a hand-placed offset', () => {
    const r = rows();
    r.nodes = r.nodes.map((n) => (n.id === 'd' ? { ...n, open: true, off: { x: 5, y: 6 } } : n));
    const moved = nestNode(r, 'd', 'z', 5)!;
    expect(moved.open).toBe(true);
    expect(moved).not.toHaveProperty('off');
  });

  it('refuses to nest a node into its own branch', () => {
    expect(nestNode(rows(), 'a', 'd', 5)).toBeNull();
  });

  it('moves a card to another node', () => {
    const r = rows();
    r.cards = r.cards.map((c) => (c.id === 'c1' ? { ...c, off: { x: 1, y: 2 } } : c));
    const moved = nestCard(r, 'c1', 'z', 5)!;
    expect(moved.parentId).toBe('z');
    expect(moved).not.toHaveProperty('off');
    expect(nestCard(r, 'c1', 'nope', 5)).toBeNull();
  });

  it('frees a nested node onto the page', () => {
    const r = rows();
    r.nodes = r.nodes.map((n) => (n.id === 'd' ? { ...n, off: { x: 5, y: 6 } } : n));
    const freed = detachNode(r, 'd', anchor, 9)!;
    expect(freed).toMatchObject({ parentId: null, anchor });
    expect(freed).not.toHaveProperty('off');
    expect(detachNode(r, 'a', anchor, 9)).toBeNull();
  });
});

describe('restyle', () => {
  it('changes the style and clears offsets below, but not the node own', () => {
    const r = rows();
    r.nodes = r.nodes.map((n) => (n.id === 'b' ? { ...n, off: { x: 1, y: 1 } } : n.id === 'd' ? { ...n, off: { x: 2, y: 2 } } : n));
    r.cards = r.cards.map((c) => (c.id === 'c1' ? { ...c, off: { x: 3, y: 3 } } : c));
    const changed = restyle(r, 'a', 'branch', 7);
    expect(changed.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'd']);
    expect(changed.nodes.find((n) => n.id === 'a')).toMatchObject({ style: 'branch', updatedAt: 7 });
    expect(changed.nodes.filter((n) => n.id !== 'a').every((n) => !n.off)).toBe(true);
    expect(changed.cards[0]).not.toHaveProperty('off');
  });

  it('does nothing when the style is the same', () => {
    expect(restyle(rows(), 'a', 'reticle', 7)).toEqual({ nodes: [], cards: [] });
  });
});

describe('deletion', () => {
  it('takes the node, everything below it and its cards', () => {
    const gone = deletionOf(rows(), 'b');
    expect(gone.nodeIds.sort()).toEqual(['b', 'd']);
    expect(gone.cardIds).toEqual(['c1']);
  });
});
