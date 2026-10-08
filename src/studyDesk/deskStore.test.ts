// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeskDB } from './db';
import { outline } from './docHtml';
import {
  addItem, createOwnDesk, deleteItem, ensureBookDesk, getDesk, listItems, listPinnedForBook, onDeskChange, putBackInDocument,
  saveDeskHtml, sendItemToDesk, setDeskDBForTests,
} from './deskStore';

const book = { id: 'b1', title: 'Muqaddima' };
const order = async (deskId: string) => outline((await getDesk(deskId))!.html).flatMap((e) => (e.kind === 'item' ? [e.id] : []));

describe('deskStore', () => {
  let n = 0;
  beforeEach(() => setDeskDBForTests(new DeskDB(`desk-test-${++n}`)));
  afterEach(() => setDeskDBForTests(null));

  it('makes one desk per book', async () => {
    const a = await ensureBookDesk(book);
    const b = await ensureBookDesk(book);
    expect(a.id).toBe(b.id);
    expect(a.title).toBe('Muqaddima');
  });

  it('adds captures to the inbox and the end of the document, in order', async () => {
    const desk = await ensureBookDesk(book);
    const one = await addItem(desk.id, { type: 'concept', text: 'Kasb' });
    const two = await addItem(desk.id, { type: 'quote', text: 'الْعَصَبِيَّةُ', ar: true, source: { bookId: 'b1', location: 'clean:3:10:20' } });
    expect(one.inInbox).toBe(true);
    expect(await order(desk.id)).toEqual([one.id, two.id]);
    expect((await listItems(desk.id)).map((i) => i.id)).toEqual([one.id, two.id]);
  });

  it('keeps margin notes out of the inbox until sent', async () => {
    const desk = await ensureBookDesk(book);
    const note = await addItem(desk.id, { type: 'line', text: '', body: 'my note', fromMargin: true, pin: { bookId: 'b1', location: 'clean:1:0:0', side: 'left' } });
    expect(note.inInbox).toBe(false);
    expect((await listPinnedForBook('b1')).map((i) => i.id)).toEqual([note.id]);
  });

  it('sends an item to another desk and deletes items from the document', async () => {
    const desk = await ensureBookDesk(book);
    const own = await createOwnDesk('Essay');
    const item = await addItem(desk.id, { type: 'concept', text: 'Kasb' });
    await sendItemToDesk(item.id, own.id);
    expect(await order(desk.id)).toEqual([]);
    expect(await order(own.id)).toEqual([item.id]);
    await deleteItem(item.id);
    expect(await order(own.id)).toEqual([]);
    expect(await listItems(own.id)).toEqual([]);
  });

  it('cleans saved html and can put a removed item back', async () => {
    const desk = await ensureBookDesk(book);
    const item = await addItem(desk.id, { type: 'concept', text: 'Kasb' });
    await saveDeskHtml(desk.id, '<p>typed <script>x</script></p>');
    expect((await getDesk(desk.id))!.html).toBe('<p>typed </p>');
    await putBackInDocument(item.id);
    expect(await order(desk.id)).toEqual([item.id]);
  });

  it('tells listeners about changes', async () => {
    let calls = 0;
    const off = onDeskChange(() => calls++);
    const desk = await ensureBookDesk(book);
    await addItem(desk.id, { type: 'concept', text: 'x' });
    off();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
