import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { findThoughts, linkPatches, unlinkedPatches } from './links';

const note = (id: string, body: string, extra: Partial<DeskItem> = {}): DeskItem => ({
  id,
  deskId: 'd',
  type: 'note',
  text: '',
  body,
  inInbox: false,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('finding thoughts to link', () => {
  const items = [
    note('a', 'Intention decides the deed'),
    note('b', 'Intention is of the heart'),
    note('c', 'Sincerity', { droppedAt: 5 }),
    note('d', 'Intention again'),
    { ...note('q', ''), type: 'question' as const, text: 'Intention?' },
  ];

  it('matches words anywhere in a thought, ignoring case, without dropped thoughts, questions or those already chosen', () => {
    expect(findThoughts(items, ' INTENTION ', ['b']).map((i) => i.id)).toEqual(['a', 'd']);
    expect(findThoughts(items, 'sincerity', [])).toEqual([]);
    expect(findThoughts(items, '  ', [])).toEqual([]);
  });

  it('stops at the most it was asked for', () => {
    expect(findThoughts(items, 'intention', [], 2)).toHaveLength(2);
  });
});

describe('linking thoughts later', () => {
  const a = note('a', 'one', { links: ['x'] });
  const b = note('b', 'two');

  it('lists each on the other, once, keeping the links it had', () => {
    expect(linkPatches(a, b, true)).toEqual([
      { id: 'a', patch: { links: ['x', 'b'] } },
      { id: 'b', patch: { links: ['a'] } },
    ]);
    const again = linkPatches({ ...a, links: ['x', 'b'] }, { ...b, links: ['a'] }, true);
    expect(again.map((p) => p.patch.links)).toEqual([['x', 'b'], ['a']]);
  });

  it('takes each off the other, leaving the rest', () => {
    expect(linkPatches({ ...a, links: ['x', 'b'] }, { ...b, links: ['a', 'y'] }, false)).toEqual([
      { id: 'a', patch: { links: ['x'] } },
      { id: 'b', patch: { links: ['y'] } },
    ]);
  });

  it('puts both back as they were for Undo', () => {
    expect(unlinkedPatches(a, b)).toEqual([
      { id: 'a', patch: { links: ['x'] } },
      { id: 'b', patch: { links: undefined } },
    ]);
  });
});
