import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { argItemsOf, spotOf } from './bridge';

const item = (id: string, location: string, argument?: DeskItem['argument'], bookId = 'b'): DeskItem => ({
  id, deskId: 'd', type: 'quote', text: id, inInbox: false, createdAt: 0, updatedAt: 0,
  source: { bookId, location }, ...(argument ? { argument } : {}),
});

describe('argItemsOf', () => {
  it('keeps only this book\'s argument items with a clean place, in one reading-order number', () => {
    const items = [
      item('a', 'clean:1:5:9', { role: 'claim', for: null }),
      item('b', 'clean:0:900:910', { role: 'grounds', for: 'a' }),
      item('plain', 'clean:0:1:2'),
      item('other', 'clean:0:1:2', { role: 'claim', for: null }, 'x'),
      item('pdf', 'pdf:1:0:0:1:1', { role: 'claim', for: null }),
    ];
    const out = argItemsOf(items, 'b').filter((n) => n.id !== 'pdf');
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out[1].spot).toBeLessThan(out[0].spot);
    expect(spotOf('clean:1:5:9')).toBe(10_000_005);
  });
  it('a margin-only item sits at its pin', () => {
    const i: DeskItem = { ...item('m', '', { role: 'warrant', for: 'a', typed: true }), source: { bookId: 'b' }, pin: { bookId: 'b', location: 'clean:2:40:41', side: 'right' } };
    expect(argItemsOf([i], 'b')[0]).toMatchObject({ spot: 20_000_040, marginOnly: true });
  });
});

import { argItemsFor } from './bridge';

describe('argItemsFor', () => {
  const items = [
    item('a', 'clean:1:5:9', { role: 'claim', for: null }),
    item('b', 'clean:2:5:9', { role: 'claim', for: null }),
    item('x', 'clean:0:5:9', { role: 'claim', for: null }, 'other'),
  ];
  it('the chapter shows that chapter only', () => {
    expect(argItemsFor(items, 'chapter', 'b', 1).map((n) => n.id)).toEqual(['a']);
    expect(argItemsFor(items, 'chapter', 'b', null)).toEqual([]);
  });
  it('the book shows its own items; across books shows all, this book first', () => {
    expect(argItemsFor(items, 'book', 'b', null).map((n) => n.id)).toEqual(['a', 'b']);
    const all = argItemsFor(items, 'all', 'b', null);
    expect(all.map((n) => n.id)).toEqual(['a', 'b', 'x']);
    expect(all[2].spot).toBeGreaterThan(all[1].spot);
  });
});

describe('PDF places', () => {
  it('order by page, then height on the page', () => {
    expect(spotOf('pdf:2:0.1000:0.2000:0.5000:0.1000')!).toBeGreaterThan(spotOf('pdf:1:0.1000:0.9000:0.5000:0.1000')!);
    expect(spotOf('pdf:1:0.1000:0.5000:0.5000:0.1000')!).toBeGreaterThan(spotOf('pdf:1:0.1000:0.2000:0.5000:0.1000')!);
  });
  it('are items of the book like any other', () => {
    const out = argItemsOf([item('p', 'pdf:3:0.1000:0.2000:0.5000:0.1000', { role: 'claim', for: null })], 'b');
    expect(out).toHaveLength(1);
    expect(out[0].marginOnly).toBe(false);
  });
});
