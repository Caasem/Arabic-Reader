import { describe, expect, it } from 'vitest';
import type { DeskItem, DeskLink } from '../studyDesk/types';
import { bookPassages, booksWithPassages, linksAcross, pickPassage, relLabel, wirePath, type Pick } from './muqabala';

const p = (id: string, bookId: string, location: string, extra: Partial<DeskItem> = {}): DeskItem => ({
  id,
  deskId: 'd',
  type: 'quote',
  text: id,
  inInbox: true,
  createdAt: 1,
  updatedAt: 1,
  source: { bookId, bookTitle: bookId.toUpperCase(), location },
  ...extra,
});

describe('Muqābala', () => {
  const a1 = p('a1', 'jami', 'pdf:62:0.1:0.5:0.8:0.1');
  const a2 = p('a2', 'jami', 'pdf:61:0.1:0.2:0.8:0.1');
  const b1 = p('b1', 'ihya', 'clean:3:10:40');
  const note = p('n', 'ihya', 'clean:3:10:10', { type: 'line' });
  const items = [a1, a2, b1, note];
  const byId = new Map(items.map((i) => [i.id, i]));

  it('lists books with passages and their passages in reading order', () => {
    expect(booksWithPassages(items).map((b) => [b.bookId, b.passages])).toEqual([
      ['jami', 2],
      ['ihya', 1],
    ]);
    expect(bookPassages(items, 'jami').map((i) => i.id)).toEqual(['a2', 'a1']);
  });

  it('orients links left to right for the two books shown', () => {
    const link: DeskLink = { id: 'l', a: 'b1', b: 'a1', rel: 'differs', note: '', createdAt: 1, updatedAt: 1 };
    expect(linksAcross([link], byId, 'jami', 'ihya').map((x) => [x.left.id, x.right.id])).toEqual([['a1', 'b1']]);
    expect(linksAcross([link], byId, 'jami', 'other')).toEqual([]);
    expect(relLabel('same')).toBe('Same text');
  });

  it('picks one side then the other, moves a pick on the same side, lets go on a second click', () => {
    const none: Pick = { pick: null, pair: null };
    const one = pickPassage(none, 'a1', 'a');
    expect(one.pick).toEqual({ id: 'a1', side: 'a' });
    expect(pickPassage(one, 'a2', 'a').pick).toEqual({ id: 'a2', side: 'a' });
    expect(pickPassage(one, 'a1', 'a')).toEqual(none);
    expect(pickPassage(one, 'b1', 'b')).toEqual({ pick: null, pair: { a: 'a1', b: 'b1' } });
    expect(pickPassage(pickPassage(none, 'b1', 'b'), 'a1', 'a').pair).toEqual({ a: 'a1', b: 'b1' });
  });

  it('draws a wire across the gap', () => {
    expect(wirePath(100, 50, 200, 80)).toBe('M 92 50 L 100 50 C 145 50, 155 80, 200 80 L 208 80');
  });
});
