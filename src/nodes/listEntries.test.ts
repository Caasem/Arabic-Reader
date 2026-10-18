import { describe, expect, it } from 'vitest';
import { listEntries } from './listEntries';
import type { CardRec, NodeAnchor, NodeRec } from './types';

const node = (id: string, anchor: NodeAnchor | null, extra: Partial<NodeRec> = {}): NodeRec => ({
  id, bookId: 'b', parentId: anchor ? null : 'p', title: id, style: 'branch', open: false, pinTitle: true, order: 0, createdAt: 1, updatedAt: 1,
  ...(anchor ? { anchor } : {}),
  ...extra,
});
const card = (id: string, parentId: string): CardRec => ({ id, bookId: 'b', parentId, kind: 'note', text: id, order: 0, createdAt: 1, updatedAt: 1 });

describe('listEntries', () => {
  it('lists the top-level nodes in book order: PDF pages by page and height, then text by chapter and word', () => {
    const rows = {
      nodes: [
        node('text-late', { kind: 'clean', chapter: 4, offset: 10, dx: 0, dy: 0 }),
        node('pdf-9', { kind: 'pdf', page: 9, x: 0, y: 0 }),
        node('text-early', { kind: 'clean', chapter: 1, offset: 900, dx: 0, dy: 0 }),
        node('pdf-2-low', { kind: 'pdf', page: 2, x: 0, y: 700 }),
        node('pdf-2-high', { kind: 'pdf', page: 2, x: 0, y: 100 }),
        node('text-same-chapter', { kind: 'clean', chapter: 1, offset: 5, dx: 0, dy: 0 }),
      ],
      cards: [],
    };
    expect(listEntries(rows).map((e) => e.id)).toEqual(['pdf-2-high', 'pdf-2-low', 'pdf-9', 'text-same-chapter', 'text-early', 'text-late']);
  });

  it('leaves out nested nodes, and says where each is, how many hang from it and whether it is carried', () => {
    const rows = {
      nodes: [node('a', { kind: 'pdf', page: 3, x: 0, y: 0 }, { carried: true }), node('inner', null, { parentId: 'a' }), node('z', { kind: 'clean', chapter: 2, offset: 0, dx: 0, dy: 0 })],
      cards: [card('c', 'a')],
    };
    const [a, z] = listEntries(rows);
    expect(listEntries(rows)).toHaveLength(2);
    expect(a).toMatchObject({ id: 'a', where: 'Page 3', count: 2, carried: true, style: 'branch' });
    expect(z).toMatchObject({ id: 'z', where: 'Chapter 3', count: 0, carried: false });
  });

  it('is empty for a book with no nodes', () => {
    expect(listEntries({ nodes: [], cards: [] })).toEqual([]);
  });
});
