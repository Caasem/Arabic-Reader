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
    const out = argItemsOf(items, 'b');
    expect(out.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out[1].spot).toBeLessThan(out[0].spot);
    expect(spotOf('clean:1:5:9')).toBe(10_000_005);
  });
  it('a margin-only item sits at its pin', () => {
    const i: DeskItem = { ...item('m', '', { role: 'warrant', for: 'a', typed: true }), source: { bookId: 'b' }, pin: { bookId: 'b', location: 'clean:2:40:41', side: 'right' } };
    expect(argItemsOf([i], 'b')[0]).toMatchObject({ spot: 20_000_040, marginOnly: true });
  });
});
