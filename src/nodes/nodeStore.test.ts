// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NodesDB } from './db';
import { buildTree } from './model';
import {
  addCard, addChildNode, addTopNode, bookRows, bulkGet, bulkPut, detach, moveTopNode, nest, onNodesChange, patchNode, readAll, removeCard, removeNode, restoreRows,
  setCardText, setOffset, setNodesDBForTests, setStyle,
} from './nodeStore';
import type { NodeAnchor } from './types';

let n = 0;
beforeEach(() => setNodesDBForTests(new NodesDB(`nodes-test-${++n}`)));

const pdf = (page: number): NodeAnchor => ({ kind: 'pdf', page, x: 10, y: 20 });

describe('adding', () => {
  it('adds top-level nodes per book, closed with the title showing', async () => {
    const a = await addTopNode('b1', pdf(1), 'reticle', 'Journey');
    await addTopNode('b2', pdf(1), 'branch', 'Other book');
    expect(a).toMatchObject({ open: false, pinTitle: true, parentId: null, style: 'reticle' });
    const rows = await bookRows('b1');
    expect(rows.nodes.map((x) => x.title)).toEqual(['Journey']);
  });

  it('adds children and cards, opening the node they go into', async () => {
    const top = await addTopNode('b1', pdf(1), 'branch', 'Top');
    const child = await addChildNode('b1', top.id, 'reticle', 'Child');
    const card = await addCard('b1', top.id, 'note', 'a note');
    expect(child?.order).toBe(0);
    expect(card?.order).toBe(1);
    const rows = await bookRows('b1');
    expect(rows.nodes.find((x) => x.id === top.id)?.open).toBe(true);
    const [tree] = buildTree(rows);
    expect(tree.kids).toHaveLength(2);
    expect(await addCard('b1', 'missing', 'note', 'x')).toBeNull();
    expect(await addChildNode('b1', 'missing', 'branch', 'x')).toBeNull();
  });

  it('tells listeners once per change', async () => {
    let calls = 0;
    const off = onNodesChange(() => calls++);
    const top = await addTopNode('b1', pdf(1), 'branch', 'Top');
    await addCard('b1', top.id, 'note', 'a');
    expect(calls).toBe(2);
    off();
  });
});

describe('editing', () => {
  it('patches a node and a card, and moves a top-level node', async () => {
    const top = await addTopNode('b1', pdf(1), 'branch', 'Top');
    const card = (await addCard('b1', top.id, 'note', 'old'))!;
    await patchNode(top.id, { title: 'Renamed', open: true, pinTitle: false, carried: true });
    await setCardText(card.id, 'new');
    await moveTopNode(top.id, pdf(5));
    const rows = await bookRows('b1');
    expect(rows.nodes[0]).toMatchObject({ title: 'Renamed', open: true, pinTitle: false, carried: true, anchor: pdf(5) });
    expect(rows.cards[0].text).toBe('new');
  });

  it('sets and clears an offset, only on nested nodes', async () => {
    const top = await addTopNode('b1', pdf(1), 'branch', 'Top');
    const child = (await addChildNode('b1', top.id, 'branch', 'Child'))!;
    const card = (await addCard('b1', top.id, 'note', 'n'))!;
    await setOffset('node', top.id, { x: 1, y: 1 });
    await setOffset('node', child.id, { x: 4, y: 5 });
    await setOffset('card', card.id, { x: 7, y: 8 });
    let rows = await bookRows('b1');
    expect(rows.nodes.find((x) => x.id === top.id)).not.toHaveProperty('off');
    expect(rows.nodes.find((x) => x.id === child.id)?.off).toEqual({ x: 4, y: 5 });
    expect(rows.cards[0].off).toEqual({ x: 7, y: 8 });
    await setOffset('node', child.id, null);
    await setOffset('card', card.id, null);
    rows = await bookRows('b1');
    expect(rows.nodes.find((x) => x.id === child.id)).not.toHaveProperty('off');
    expect(rows.cards[0]).not.toHaveProperty('off');
  });

  it('switches style and clears the offsets below', async () => {
    const top = await addTopNode('b1', pdf(1), 'reticle', 'Top');
    const child = (await addChildNode('b1', top.id, 'reticle', 'Child'))!;
    await setOffset('node', child.id, { x: 4, y: 5 });
    await setStyle('b1', top.id, 'branch');
    const rows = await bookRows('b1');
    expect(rows.nodes.find((x) => x.id === top.id)?.style).toBe('branch');
    expect(rows.nodes.find((x) => x.id === child.id)).not.toHaveProperty('off');
  });
});

describe('moving between parents', () => {
  it('nests a node and a card, opening the target', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    const z = await addTopNode('b1', pdf(2), 'branch', 'Z');
    const card = (await addCard('b1', a.id, 'note', 'n'))!;
    expect(await nest('b1', 'node', z.id, a.id)).toBe(true);
    expect(await nest('b1', 'card', card.id, a.id)).toBe(true);
    const rows = await bookRows('b1');
    const zRow = rows.nodes.find((x) => x.id === z.id)!;
    expect(zRow.parentId).toBe(a.id);
    expect(zRow).not.toHaveProperty('anchor');
    expect(buildTree(rows)).toHaveLength(1);
  });

  it('refuses to nest a node into itself or its own branch', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    const b = (await addChildNode('b1', a.id, 'branch', 'B'))!;
    expect(await nest('b1', 'node', a.id, b.id)).toBe(false);
    expect(await nest('b1', 'node', a.id, a.id)).toBe(false);
    expect(await nest('b1', 'node', a.id, 'missing')).toBe(false);
  });

  it('detaches a nested node onto the page', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    const b = (await addChildNode('b1', a.id, 'branch', 'B'))!;
    expect(await detach('b1', b.id, pdf(4))).toBe(true);
    expect(await detach('b1', a.id, pdf(4))).toBe(false);
    const rows = await bookRows('b1');
    expect(rows.nodes.find((x) => x.id === b.id)).toMatchObject({ parentId: null, anchor: pdf(4) });
  });
});

describe('deleting', () => {
  it('removes a node with everything below it, and can put it back', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    const b = (await addChildNode('b1', a.id, 'branch', 'B'))!;
    await addCard('b1', b.id, 'note', 'deep');
    const keep = await addTopNode('b1', pdf(2), 'branch', 'Keep');
    const removed = await removeNode('b1', a.id);
    expect(removed.nodes.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(removed.cards).toHaveLength(1);
    let rows = await bookRows('b1');
    expect(rows.nodes.map((x) => x.id)).toEqual([keep.id]);
    expect(rows.cards).toEqual([]);
    await restoreRows(removed);
    rows = await bookRows('b1');
    expect(rows.nodes).toHaveLength(3);
    expect(rows.cards).toHaveLength(1);
  });

  it('removes a single card', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    const card = (await addCard('b1', a.id, 'note', 'x'))!;
    expect((await removeCard(card.id))?.id).toBe(card.id);
    expect((await bookRows('b1')).cards).toEqual([]);
  });
});

describe('export and import', () => {
  it('reads every row and writes rows back', async () => {
    const a = await addTopNode('b1', pdf(1), 'branch', 'A');
    await addCard('b1', a.id, 'note', 'x');
    expect(await readAll('nodes')).toHaveLength(1);
    const cards = await readAll('cards');
    expect(cards).toHaveLength(1);
    const [got] = await bulkGet('cards', [cards[0].id, 'nope']);
    expect(got?.text).toBe('x');
    await bulkPut('cards', [{ ...cards[0], id: 'copy' }]);
    expect(await readAll('cards')).toHaveLength(2);
  });
});
