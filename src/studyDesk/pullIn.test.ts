// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta } from '../types';
import { DeskDB } from './db';
import { addItem, ensureBookDesk, getItem, listItems, setDeskDBForTests } from './deskStore';
import { filterCandidates, listPullCandidates, pullIn, pullInImage } from './pullIn';

vi.mock('../reader/annotations/annotationService', () => ({
  annotationService: {
    listAll: async () => [
      { id: 'hl1', bookId: 'b2', bookTitle: 'Tahafut', cfiRange: 'clean:1:5:20', text: 'إن العالم قديم', color: 'yellow', note: 'the claim', chapterLabel: 'Ch. 1', createdAt: 10, updatedAt: 10 },
    ],
  },
}));
vi.mock('../vocabulary', () => ({
  vocabularyService: { list: async () => [{ id: 'v1', surfaceForm: 'عصبية', meaning: 'group feeling', bookId: 'b1', bookTitle: 'Muqaddima', location: 'clean:2:1:6', addedAt: 20 }] },
}));
const pins: string[] = [];
vi.mock('../blobStore', () => ({
  getBlobStore: () => ({
    put: async () => ({ hash: 'img-hash' }),
    pin: async (hash: string, _ns: string, owner: string) => (pins.push(`${hash}>${owner}`), true),
  }),
}));

const book = { id: 'b1', title: 'Muqaddima' } as BookMeta;

describe('pull in', () => {
  let n = 0;
  beforeEach(() => setDeskDBForTests(new DeskDB(`pull-test-${++n}`)));
  afterEach(() => setDeskDBForTests(null));

  it('lists highlights, words and other books’ desk items, newest first', async () => {
    const other = await ensureBookDesk({ id: 'b2', title: 'Tahafut' });
    await addItem(other.id, { type: 'concept', text: 'Eternity of the world', source: { bookId: 'b2', bookTitle: 'Tahafut' } });
    const own = await ensureBookDesk(book);
    await addItem(own.id, { type: 'concept', text: 'Mine', source: { bookId: 'b1' } });
    const all = await listPullCandidates(book);
    expect(all.map((c) => c.kind)).toEqual(['item', 'word', 'highlight']);
    expect(all.find((c) => c.kind === 'item')!.text).toBe('Eternity of the world');
    expect(filterCandidates(all, 'group FEEL').map((c) => c.kind)).toEqual(['word']);
    expect(filterCandidates(all, 'tahafut claim').map((c) => c.kind)).toEqual(['highlight']);
  });

  it('places a pulled item in a margin of the open page, with its source', async () => {
    const all = await listPullCandidates(book);
    const hl = all.find((c) => c.kind === 'highlight')!;
    const desk = await ensureBookDesk(book);
    const item = await pullIn(book, desk.id, hl, 'left', { bookId: 'b1', location: 'clean:4:100:100' });
    expect(item).toMatchObject({ type: 'quote', inInbox: false, pin: { bookId: 'b1', location: 'clean:4:100:100', side: 'left' }, source: { bookId: 'b2', location: 'clean:1:5:20' } });
  });

  it('goes to the inbox when asked, or when there is no page to place on', async () => {
    const all = await listPullCandidates(book);
    const word = all.find((c) => c.kind === 'word')!;
    const desk = await ensureBookDesk(book);
    const a = await pullIn(book, desk.id, word, 'inbox', { bookId: 'b1', location: 'clean:4:1:1' });
    const b = await pullIn(book, desk.id, word, 'right', null);
    for (const i of [a, b]) expect(i.inInbox && !i.pin).toBe(true);
    expect(a).toMatchObject({ type: 'concept', text: 'عصبية', body: 'group feeling', ar: true });
  });

  it('shares a copied item’s image, and stores an image file as a screenshot', async () => {
    const other = await ensureBookDesk({ id: 'b2', title: 'Tahafut' });
    const src = await addItem(other.id, { type: 'capture', text: 'Region of page 3', imageHash: 'h1', source: { bookId: 'b2', bookTitle: 'Tahafut' } });
    const c = (await listPullCandidates(book)).find((x) => x.key === 'i:' + src.id)!;
    const desk = await ensureBookDesk(book);
    const copy = await pullIn(book, desk.id, c, 'inbox', null);
    expect(pins).toContain(`h1>${copy.id}`);
    expect((await getItem(copy.id))!.imageHash).toBe('h1');

    const img = await pullInImage(book, desk.id, new Blob(['x'], { type: 'image/png' }), 'right', { bookId: 'b1', location: 'clean:1:1:1' });
    expect((await getItem(img.id))!).toMatchObject({ type: 'capture', imageHash: 'img-hash', pin: { side: 'right' } });
    expect((await listItems(desk.id)).length).toBe(2);
  });
});
