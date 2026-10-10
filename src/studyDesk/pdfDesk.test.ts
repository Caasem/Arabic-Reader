import { describe, expect, it } from 'vitest';
import { pdfBoxMarks, pdfMarks, stackTops } from './pdfDesk';
import type { DeskItem } from './types';

const item = (id: string, extra: Partial<DeskItem>): DeskItem => ({ id, deskId: 'd', type: 'capture', text: '', inInbox: true, createdAt: 0, updatedAt: 0, ...extra });

describe('PDF page marks', () => {
  it('finds this page’s regions from sources and pins, top to bottom', () => {
    const items = [
      item('a', { source: { bookId: 'b', location: 'pdf:2:0.1:0.5:0.2:0.1' } }),
      item('b', { source: { bookId: 'b', location: 'pdf:2:0.1:0.2:0.2:0.1' } }),
      item('c', { source: { bookId: 'b', location: 'pdf:3:0.1:0.2:0.2:0.1' } }),
      item('d', { source: { bookId: 'other', location: 'pdf:2:0.1:0.2:0.2:0.1' } }),
      item('e', { source: { bookId: 'b', location: 'clean:2:1:5' } }),
      item('f', { pin: { bookId: 'b', location: 'pdf:2:0.4:0.7:0.1:0.1', side: 'right' } }),
      item('g', { hidden: true, source: { bookId: 'b', location: 'pdf:2:0.1:0.9:0.2:0.05' } }),
      item('h', { fromMargin: true, pin: { bookId: 'b', location: 'pdf:2:0:0.95:1:0', side: 'right' } }),
    ];
    expect(pdfMarks(items, 'b', 2).map((m) => m.item.id)).toEqual(['b', 'a', 'f', 'h']);
    expect(pdfMarks(items, 'b', 2)[0]).toMatchObject({ page: 2, x: 0.1, y: 0.2, w: 0.2, h: 0.1 });
    expect(pdfMarks(items, 'b').map((m) => m.item.id)).toEqual(['b', 'a', 'f', 'h', 'c']);
  });

  it('stacks cards level with their regions without overlapping', () => {
    expect(stackTops([10, 20, 200], [50, 30, 20])).toEqual([10, 68, 200]);
  });
});

describe('PDF page boxes', () => {
  it('keeps a region’s box when its card is pinned to a pile’s level elsewhere', () => {
    const items = [
      // In a pile: pinned to the pile's level, captured as a box.
      item('a', { source: { bookId: 'b', location: 'pdf:2:0.1:0.5:0.2:0.1' }, pin: { bookId: 'b', location: 'pdf:2:0:0.3:1:0', side: 'right' } }),
      // Pinned as a box itself.
      item('b', { pin: { bookId: 'b', location: 'pdf:2:0.3:0.2:0.2:0.1', side: 'right' } }),
      // A margin note: a level only, no box.
      item('c', { type: 'line', fromMargin: true, pin: { bookId: 'b', location: 'pdf:2:0:0.4:1:0', side: 'right' } }),
    ];
    expect(pdfBoxMarks(items, 'b', 2).map((m) => [m.item.id, m.y])).toEqual([
      ['a', 0.5],
      ['b', 0.2],
    ]);
    expect(pdfBoxMarks(items, 'b', 3)).toEqual([]);
  });
});
