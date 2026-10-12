import { describe, expect, it } from 'vitest';
import { cardFromNodes, hiddenAfter, hiddenFor, occlusionCard, occlusionTargets, treeOrder, walkOrder } from './sketchCards';
import { sketchSvg } from './toMargin';
import type { Sketch, SketchNode } from './types';

const node = (id: string, text: string, x = 0, y = 0): SketchNode => ({ id, x, y, w: 100, h: 40, text, kind: 'plain' });
const edge = (a: string, b: string) => ({ id: `${a}${b}`, a, b, dir: true });
const sheet = (nodes: SketchNode[], edges: Sketch['edges'] = []): Sketch => ({
  id: 's1', bookId: 'b', key: 'clean:1', location: 'clean:1:0:1', mode: 'diagram', view: { tx: 0, ty: 0, s: 1 }, strokes: [], nodes, edges, createdAt: 0, updatedAt: 0,
});

const tree = sheet(
  [node('p', 'جذر', 0, 0), node('c1', 'ك ت ب', 0, 100), node('c2', 'ع ل م', 100, 100), node('lone', 'alone', 300, 0)],
  [edge('p', 'c1'), edge('p', 'c2')]
);

describe('cardFromNodes', () => {
  it('uses the children as the back, in edge order', () => {
    const r = cardFromNodes(tree, ['p']);
    expect(r).toMatchObject({ ok: true, spec: { front: 'جذر', back: 'ك ت ب\nع ل م', sketch: { sketchId: 's1', nodeIds: ['p'] } } });
  });
  it('refuses a node with no children and says why', () => {
    const r = cardFromNodes(tree, ['lone']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/answer/);
  });
  it('falls back to the other selected nodes when there are no children', () => {
    const r = cardFromNodes(tree, ['lone', 'c1']);
    expect(r).toMatchObject({ ok: true, spec: { front: 'alone', back: 'ك ت ب' } });
  });
  it('refuses an empty selection or a wordless node', () => {
    expect(cardFromNodes(tree, []).ok).toBe(false);
    expect(cardFromNodes(sheet([node('x', '  ')]), ['x']).ok).toBe(false);
  });
});

describe('treeOrder', () => {
  it('lists roots top to bottom, each followed by its children', () => {
    expect(treeOrder(tree)).toEqual(['p', 'c1', 'c2', 'lone']);
  });
  it('ends on a cycle and still lists every node once', () => {
    const loop = sheet([node('a', 'a', 0, 0), node('b', 'b', 0, 50), node('c', 'c', 0, 100)], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('a', 'a')]);
    expect(treeOrder(loop)).toEqual(['a', 'b', 'c']);
  });
});

describe('occlusion', () => {
  it('targets the selected labelled nodes, else every labelled node', () => {
    const withBlank = sheet([...tree.nodes, node('blank', '')], tree.edges);
    expect(occlusionTargets(withBlank, [])).toEqual(['p', 'c1', 'c2', 'lone']);
    expect(occlusionTargets(withBlank, ['c2', 'blank'])).toEqual(['c2']);
  });
  it('has a text fallback: ?, the sheet name and the parent, with the label as the back', () => {
    expect(occlusionCard(tree, 'Roots', 'c1')).toEqual({ front: '?\nRoots\nجذر', back: 'ك ت ب', sketch: { sketchId: 's1', nodeIds: ['c1'], occlude: 'c1' } });
    expect(occlusionCard(tree, 'Roots', 'p')?.front).toBe('?\nRoots');
    expect(occlusionCard(tree, 'Roots', 'nope')).toBeNull();
  });
  it('hides the occluded label on the front only, in the picture', () => {
    const ref = { sketchId: 's1', nodeIds: ['c1'], occlude: 'c1' };
    const front = sketchSvg(tree, { hide: hiddenFor(ref, 'front') }).svg;
    const back = sketchSvg(tree, { hide: hiddenFor(ref, 'back') }).svg;
    expect(front).not.toContain('ك ت ب');
    expect(front).toContain('ع ل م');
    expect(back).toContain('ك ت ب');
  });
});

describe('walk-through', () => {
  it('reveals labels in tree order', () => {
    const order = walkOrder(tree);
    expect(order).toEqual(['p', 'c1', 'c2', 'lone']);
    expect([...hiddenAfter(order, 0)]).toEqual(order);
    expect([...hiddenAfter(order, 2)]).toEqual(['c2', 'lone']);
    expect(hiddenAfter(order, 4).size).toBe(0);
  });
});
