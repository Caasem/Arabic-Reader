import { describe, expect, it } from 'vitest';
import { pdfMarks, stackTops } from './pdfDesk';
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
    ];
    expect(pdfMarks(items, 'b', 2).map((m) => m.item.id)).toEqual(['b', 'a', 'f']);
    expect(pdfMarks(items, 'b', 2)[0]).toMatchObject({ page: 2, x: 0.1, y: 0.2, w: 0.2, h: 0.1 });
    expect(pdfMarks(items, 'b').map((m) => m.item.id)).toEqual(['b', 'a', 'f', 'c']);
  });

  it('stacks cards level with their regions without overlapping', () => {
    expect(stackTops([10, 20, 200], [50, 30, 20])).toEqual([10, 68, 200]);
  });
});
