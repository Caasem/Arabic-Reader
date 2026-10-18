import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildTree } from './model';
import { NodeGroup, type ViewCtx } from './NodeView';
import { applyLive } from './useNodeDrag';
import type { CardRec, NodeRec } from './types';

const node = (id: string, parentId: string | null, extra: Partial<NodeRec> = {}): NodeRec => ({
  id, bookId: 'b', parentId, title: id, style: 'reticle', open: false, pinTitle: true, order: 0, createdAt: 1, updatedAt: 1, ...extra,
});
const card = (id: string, parentId: string, order = 0, extra: Partial<CardRec> = {}): CardRec => ({ id, bookId: 'b', parentId, kind: 'note', text: `text ${id}`, order, createdAt: 1, updatedAt: 1, ...extra });
const ctx: ViewCtx = { width: 700, height: 600, controls: true, carry: false, drop: null };

const render = (nodes: NodeRec[], cards: CardRec[], x: number, y: number, over: Partial<ViewCtx> = {}) => {
  const [root] = buildTree({ nodes, cards });
  return renderToStaticMarkup(createElement(NodeGroup, { root, x, y, ctx: { ...ctx, ...over } }));
};
const html = (nodes: NodeRec[], cards: CardRec[], over: Partial<ViewCtx> = {}, x = 100) => render(nodes, cards, x, 200, over);

describe('a closed node', () => {
  it('is a dot with its title and how many things hang from it, and nothing else', () => {
    const out = html([node('a', null)], [card('c', 'a')]);
    expect(out).toContain('aria-label="a, 1 attached"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('nx-pn');
    expect(out).not.toContain('text c');
    // the title shows (pinned) but the controls that change the node do not
    expect(out).toContain('data-nx-pin');
    expect(out).not.toContain('data-nx-add');
  });
});

describe('an open reticle', () => {
  it('opens a panel with an outline, and the controls', () => {
    const out = html([node('a', null, { open: true }), node('b', 'a')], [card('c', 'a', 1)]);
    expect(out).toContain('data-nx-owner="a"');
    expect(out).toContain('text c');
    expect(out).toContain('data-nx-style="a"');
    expect(out).toContain('data-nx-add="note"');
    expect(out).toContain('data-nx-add="node"');
    expect(out).toContain('data-nx-remove="a"');
    // a top-level node can be carried or freed? only carried, and only when asked for
    expect(out).not.toContain('data-nx-detach');
    expect(out).not.toContain('data-nx-carry');
  });

  it('offers carrying on a top-level node and detaching on a nested one', () => {
    const rows = [node('a', null, { open: true }), node('b', 'a', { open: true })];
    const out = html(rows, [], { carry: true });
    expect(out).toContain('data-nx-carry="a"');
    expect(out).toContain('data-nx-detach="b"');
  });

  it('says so when it is empty', () => {
    expect(html([node('a', null, { open: true })], [])).toContain('Nothing attached yet');
  });

  it('opens up on the lower part of the page, and away from the nearer edge', () => {
    const rows = [node('a', null, { open: true })];
    expect(render(rows, [], 600, 500)).toContain('nx-l up');
    expect(render(rows, [], 100, 100)).toContain('nx-r dn');
  });

  it('floats a node with an offset out of the outline, tied to the dot', () => {
    const out = html([node('a', null, { open: true }), node('f', 'a', { off: { x: 40, y: -30 } })], []);
    expect(out).toContain('nx-float');
    expect(out).toContain('class="nx-fl"');
    expect(out).toContain('x2="40"');
    expect(out).toContain('y2="-30"');
    // the floated node has its own dot, as a nested one
    expect(out).toContain('data-nx-dot="f"');
    expect(out).not.toMatch(/data-nx-dot="f"[^>]*data-nx-top/);
  });
});

describe('carrying', () => {
  const open = (extra: Partial<NodeRec> = {}) => [node('a', null, { open: true, ...extra })];

  it('offers to carry a node that is not carried', () => {
    const out = html(open(), [], { carry: true });
    expect(out).toContain('data-nx-carry="a"');
    expect(out).not.toContain('data-nx-putdown');
    expect(out).not.toContain('is-carried');
  });

  it('offers to put a carried node down here or send it home, and marks its dot', () => {
    const out = html(open({ carried: true, carryAt: { x: 0.5, y: 0.5 } }), [], { carry: true });
    expect(out).toContain('data-nx-putdown="a"');
    expect(out).toContain('data-nx-return="a"');
    expect(out).not.toContain('data-nx-carry=');
    expect(out).toContain('is-carried');
  });
});

describe('a branch', () => {
  it('draws a connector per child and a card per card, in a column away from the nearer edge', () => {
    const rows = [node('a', null, { open: true, style: 'branch' }), node('b', 'a', { style: 'branch' })];
    const out = html(rows, [card('c', 'a', 1)]);
    expect((out.match(/<path class="[ni]"/g) ?? []).length).toBe(2);
    expect(out).toContain('data-nx-card="c"');
    expect(out).toContain('nx-s-r');
    const right = html(rows, [card('c', 'a', 1)], {}, 600);
    expect(right).toContain('nx-s-l');
  });

  it('opens a reticle inside it as a panel at its own dot', () => {
    const rows = [node('a', null, { open: true, style: 'branch' }), node('p', 'a', { open: true })];
    expect(html(rows, [card('c', 'p')])).toContain('data-nx-owner="p"');
  });

  it('shows the drop highlight on the node a dragged thing is over', () => {
    const rows = [node('a', null, { open: true, style: 'branch' }), node('b', 'a', { style: 'branch' })];
    expect(html(rows, [], { drop: { id: 'b', part: 'dot' } })).toMatch(/nx-drop[^>]*data-nx-dot="b"/);
  });
});

describe('applyLive', () => {
  const rows = { nodes: [node('a', null), node('b', 'a')], cards: [card('c', 'a')] };
  it('puts the live offset on the dragged node or card only', () => {
    const n = applyLive(rows, { kind: 'node', id: 'b', off: { x: 1, y: 2 } });
    expect(n.nodes.find((x) => x.id === 'b')?.off).toEqual({ x: 1, y: 2 });
    expect(n.nodes.find((x) => x.id === 'a')?.off).toBeUndefined();
    const c = applyLive(rows, { kind: 'card', id: 'c', off: { x: 3, y: 4 } });
    expect(c.cards[0].off).toEqual({ x: 3, y: 4 });
    expect(rows.cards[0].off).toBeUndefined();
  });
});
