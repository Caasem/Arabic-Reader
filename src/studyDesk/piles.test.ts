import { describe, expect, it } from 'vitest';
import { fromOtherBooks, groupOf, groupPiles, isBeneath, planName, planPile, planPileMany, planUnpile, undoPatches, type ItemPatch } from './piles';
import type { DeskItem, DeskPin } from './types';

let t = 0;
const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'book:a', type: 'line', text: id, inInbox: false, createdAt: ++t, updatedAt: t, ...extra });
const place: DeskPin = { bookId: 'a', location: 'clean:2:10:20', side: 'right' };

/** The items after the patches, as patchItems leaves them. */
function apply(items: DeskItem[], patches: ItemPatch[]): DeskItem[] {
  return items.map((i) => {
    const p = patches.filter((x) => x.id === i.id);
    if (!p.length) return i;
    const next = { ...i } as Record<string, unknown>;
    for (const { patch } of p)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
    return next as unknown as DeskItem;
  });
}

describe('piles', () => {
  it('drops a card under another: the target stays on top and the pile sits at its place', () => {
    const a = item('a'), b = item('b', { pin: { bookId: 'a', location: 'clean:5:0:4', side: 'left' } });
    const after = apply([a, b], planPile([a], [b], place));
    const piles = groupPiles(after);
    expect(piles.size).toBe(1);
    const [group] = [...piles.values()];
    expect(group.map((m) => m.id)).toEqual(['a', 'b']);
    expect(group[1].pin).toEqual(place);
    expect(group[0].pin).toBeUndefined();
    expect(isBeneath(group[1], piles)).toBe(true);
    expect(isBeneath(group[0], piles)).toBe(false);
  });

  it('adds to the bottom of an existing pile and keeps its name and tab', () => {
    let items = [item('a'), item('b'), item('c')];
    items = apply(items, planPile([items[0]], [items[1]], place));
    let group = [...groupPiles(items).values()][0];
    items = apply(items, planName(group, ' Habit ', '#4f7a5a'));
    group = [...groupPiles(items).values()][0];
    items = apply(items, planPile(group, [items[2]], place));
    group = [...groupPiles(items).values()][0];
    expect(group.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(group.every((m) => m.pile?.name === 'Habit' && m.pile.color === '#4f7a5a')).toBe(true);
  });

  it('drops a whole pile onto a card: all of it goes beneath, taking its name along', () => {
    let items = [item('a'), item('b'), item('c')];
    items = apply(items, planPile([items[1]], [items[2]], place));
    const bc = [...groupPiles(items).values()][0];
    items = apply(items, planName(bc, 'Moved', undefined));
    items = apply(items, planPile([items[0]], [...groupPiles(items).values()][0], place));
    const piles = groupPiles(items);
    expect(piles.size).toBe(1);
    const group = [...piles.values()][0];
    expect(group.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(group[0].pile?.name).toBe('Moved');
  });

  it('takes a card off; a pile of one dissolves', () => {
    let items = [item('a'), item('b'), item('c')];
    items = apply(items, planPileMany([[items[0]], [items[1]], [items[2]]], place));
    let group = [...groupPiles(items).values()][0];
    items = apply(items, planUnpile(group, 'b', { ...place, side: 'left' }));
    group = [...groupPiles(items).values()][0];
    expect(group.map((m) => m.id)).toEqual(['a', 'c']);
    expect(group.map((m) => m.pile?.order)).toEqual([0, 1]);
    expect(items.find((i) => i.id === 'b')?.pile).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.pin?.side).toBe('left');
    items = apply(items, planUnpile(group, 'a'));
    expect(groupPiles(items).size).toBe(0);
    expect(items.every((i) => !i.pile)).toBe(true);
  });

  it('a new top when the top card leaves', () => {
    let items = [item('a'), item('b'), item('c')];
    items = apply(items, planPileMany([[items[0]], [items[1]], [items[2]]], place));
    items = apply(items, planUnpile([...groupPiles(items).values()][0], 'a'));
    expect([...groupPiles(items).values()][0].map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('piles a lasso selection in the order the cards sit, and ignores a single card', () => {
    const [a, b, c] = [item('a'), item('b'), item('c')];
    expect(planPileMany([[a]], place)).toEqual([]);
    const after = apply([a, b, c], planPileMany([[c], [a], [b]], place));
    expect([...groupPiles(after).values()][0].map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('undoes exactly what it changed', () => {
    const before = [item('a'), item('b', { pin: { bookId: 'a', location: 'clean:5:0:4', side: 'left' } })];
    const patches = planPile([before[0]], [before[1]], place);
    const after = apply(before, patches);
    const back = apply(after, undoPatches(before, patches));
    expect(back).toEqual(before);
  });

  it('naming needs a pile, and an empty name clears it', () => {
    const a = item('a');
    expect(planName([a], 'x', undefined)).toEqual([]);
    let items = apply([a, item('b')], planPile([a], [item('b')], place));
    items = apply(items, planName([...groupPiles(items).values()][0], 'Named', '#4a6f96'));
    items = apply(items, planName([...groupPiles(items).values()][0], '  ', undefined));
    expect(items.every((i) => i.pile && !i.pile.name && !i.pile.color)).toBe(true);
  });

  it('counts cards from other books and finds an item’s pile', () => {
    let items = [item('a', { source: { bookId: 'a' } }), item('b', { source: { bookId: 'z', bookTitle: 'Tahafut' } }), item('c')];
    items = apply(items, planPileMany([[items[0]], [items[1]], [items[2]]], place));
    const piles = groupPiles(items);
    const group = groupOf(items[2], piles);
    expect(group).toHaveLength(3);
    expect(fromOtherBooks(group, 'a')).toBe(1);
    expect(groupOf(item('lone'), piles)).toHaveLength(1);
  });
});
