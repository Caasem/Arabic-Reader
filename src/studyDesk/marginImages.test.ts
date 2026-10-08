// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeskDB } from './db';
import { addItem, ensureBookDesk, getItem, setDeskDBForTests } from './deskStore';
import { attachImage } from './marginImages';

const calls: string[] = [];
let next = 'h1';
vi.mock('../blobStore', () => ({
  getBlobStore: () => ({
    put: async (_b: Blob, o: { owner: string }) => (calls.push(`put ${next}>${o.owner}`), { hash: next }),
    unpin: async (hash: string, _ns: string, owner: string) => void calls.push(`unpin ${hash}>${owner}`),
  }),
}));

describe('margin images', () => {
  let n = 0;
  beforeEach(() => setDeskDBForTests(new DeskDB(`img-test-${++n}`)));
  afterEach(() => setDeskDBForTests(null));

  it('turns a plain margin note into a screenshot, and replaces an image it had', async () => {
    const desk = await ensureBookDesk({ id: 'b1', title: 'Book' });
    const note = await addItem(desk.id, { type: 'line', text: '', body: 'Figure', fromMargin: true });
    await attachImage(note, new Blob(['a'], { type: 'image/png' }));
    const once = (await getItem(note.id))!;
    expect(once).toMatchObject({ type: 'capture', imageHash: 'h1', body: 'Figure' });

    next = 'h2';
    await attachImage(once, new Blob(['b'], { type: 'image/png' }));
    expect((await getItem(note.id))!.imageHash).toBe('h2');
    expect(calls).toEqual([`put h1>${note.id}`, `put h2>${note.id}`, `unpin h1>${note.id}`]);
  });

  it('keeps the type of a note that was already turned into something', async () => {
    const desk = await ensureBookDesk({ id: 'b1', title: 'Book' });
    const q = await addItem(desk.id, { type: 'question', text: '', body: 'Why?', fromMargin: true });
    await attachImage(q, new Blob(['a'], { type: 'image/png' }));
    expect((await getItem(q.id))!.type).toBe('question');
  });
});
