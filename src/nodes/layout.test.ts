import { describe, expect, it } from 'vitest';
import { DX, floatedNodes, growSide, layoutBranch, PITCH } from './layout';
import { buildTree } from './model';
import type { CardRec, NodeRec } from './types';

const node = (id: string, parentId: string | null, extra: Partial<NodeRec> = {}): NodeRec => ({
  id, bookId: 'b', parentId, title: id, style: 'branch', open: true, pinTitle: true, order: 0, createdAt: 1, updatedAt: 1, ...extra,
});
const card = (id: string, parentId: string, order: number, extra: Partial<CardRec> = {}): CardRec => ({ id, bookId: 'b', parentId, kind: 'note', text: id, order, createdAt: 1, updatedAt: 1, ...extra });

const at = (placed: ReturnType<typeof layoutBranch>, id: string) => {
  const p = placed.find((x) => (x.kid.type === 'node' ? x.kid.node.id : x.kid.card.id) === id)!;
  return { x: p.x, y: p.y };
};

describe('layoutBranch', () => {
  it('puts the top-level node at the origin and its children in a column, centred on it', () => {
    const [root] = buildTree({ nodes: [node('r', null)], cards: [card('a', 'r', 0), card('b', 'r', 1), card('c', 'r', 2)] });
    const placed = layoutBranch(root, 1);
    expect(placed[0].parent).toBeNull();
    expect(at(placed, 'r')).toEqual({ x: 0, y: 0 });
    expect(at(placed, 'a')).toEqual({ x: DX, y: -PITCH });
    expect(at(placed, 'b')).toEqual({ x: DX, y: 0 });
    expect(at(placed, 'c')).toEqual({ x: DX, y: PITCH });
  });

  it('grows the other way on the other side', () => {
    const [root] = buildTree({ nodes: [node('r', null)], cards: [card('a', 'r', 0)] });
    expect(at(layoutBranch(root, -1), 'a').x).toBe(-DX);
  });

  it('gives an open branch node its children in the next column, and a closed one a single row', () => {
    const open = buildTree({ nodes: [node('r', null), node('n', 'r', { order: 0 })], cards: [card('a', 'n', 0), card('b', 'n', 1)] })[0];
    const placed = layoutBranch(open, 1);
    expect(at(placed, 'n')).toEqual({ x: DX, y: 0 });
    expect(at(placed, 'a')).toEqual({ x: 2 * DX, y: -PITCH / 2 });
    expect(at(placed, 'b')).toEqual({ x: 2 * DX, y: PITCH / 2 });
    const closed = buildTree({ nodes: [node('r', null), node('n', 'r', { open: false })], cards: [card('a', 'n', 0)] })[0];
    expect(layoutBranch(closed, 1)).toHaveLength(2);
  });

  it('treats a reticle node below the top as a leaf: its children are not laid out', () => {
    const tree = buildTree({ nodes: [node('r', null), node('n', 'r', { style: 'reticle' })], cards: [card('a', 'n', 0)] })[0];
    expect(layoutBranch(tree, 1).map((p) => p.depth)).toEqual([0, 1]);
  });

  it('shifts a node by its offset and takes what hangs from it along', () => {
    const tree = buildTree({
      nodes: [node('r', null), node('n', 'r', { off: { x: 10, y: 30 } })],
      cards: [card('a', 'n', 0), card('b', 'r', 1, { off: { x: -5, y: 0 } })],
    })[0];
    const placed = layoutBranch(tree, 1);
    // Without offsets: n at row 0 and b at row 1 → n.y = -PITCH/2 ... n has one child so rows: n(a) = 1 row, b = 1 row.
    const plain = layoutBranch(buildTree({ nodes: [node('r', null), node('n', 'r')], cards: [card('a', 'n', 0), card('b', 'r', 1)] })[0], 1);
    expect(at(placed, 'n')).toEqual({ x: at(plain, 'n').x + 10, y: at(plain, 'n').y + 30 });
    expect(at(placed, 'a')).toEqual({ x: at(plain, 'a').x + 10, y: at(plain, 'a').y + 30 });
    expect(at(placed, 'b')).toEqual({ x: at(plain, 'b').x - 5, y: at(plain, 'b').y });
  });

  it('lists parents before children and points each at its parent', () => {
    const tree = buildTree({ nodes: [node('r', null), node('n', 'r')], cards: [card('a', 'n', 0)] })[0];
    const placed = layoutBranch(tree, 1);
    placed.forEach((p, i) => p.parent !== null && expect(p.parent).toBeLessThan(i));
  });
});

describe('growSide', () => {
  it('grows toward the side with more room', () => {
    expect(growSide(100, 700)).toBe(1);
    expect(growSide(600, 700)).toBe(-1);
  });
});

describe('floatedNodes', () => {
  const tree = (open: boolean) =>
    buildTree({
      nodes: [node('p', null, { style: 'reticle', open }), node('row', 'p', { style: 'reticle' }), node('out', 'row', { off: { x: 5, y: 5 } }), node('out2', 'p', { off: { x: 9, y: 9 } })],
      cards: [],
    })[0];

  it('finds nodes with an offset through the open rows', () => {
    expect(floatedNodes(tree(true)).map((k) => k.node.id).sort()).toEqual(['out', 'out2']);
  });

  it('shows nothing while the owner is closed, or a row that holds one is closed', () => {
    expect(floatedNodes(tree(false))).toEqual([]);
    const t = tree(true);
    const row = t.kids.find((k) => k.type === 'node' && k.node.id === 'row');
    if (row?.type === 'node') row.node.open = false;
    expect(floatedNodes(t).map((k) => k.node.id)).toEqual(['out2']);
  });
});
