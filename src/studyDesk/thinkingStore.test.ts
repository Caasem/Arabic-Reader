// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeskDB } from './db';
import { outline } from './docHtml';
import {
  addItem, addJournal, addLink, createThread, deleteDesk, deleteDeskKeepingUndo, deleteItem, deleteLink, ensureBookDesk, getDesk, getItem, joinThread, leaveThread, listDesks,
  listJournal, listLinks, onItemAdded, readAll, restoreDeletedDesk, restoreLink, setDeskArchived, setDeskDBForTests, updateDesk,
} from './deskStore';

const book = { id: 'b1', title: 'Jāmiʿ' };
const embeds = async (deskId: string) => outline((await getDesk(deskId))!.html).flatMap((e) => (e.kind === 'item' ? [e.id] : []));

describe('desk database version 2', () => {
  it('opens a version 1 database with its rows intact and adds the new tables', async () => {
    const name = 'desk-migrate-v1';
    const old = new Dexie(name);
    old.version(1).stores({ items: 'id, deskId, createdAt', desks: 'id, bookId' });
    await old.table('desks').put({ id: 'book:b1', kind: 'book', bookId: 'b1', title: 'Jāmiʿ', html: '<p><br></p>', createdAt: 1, updatedAt: 1 });
    await old.table('items').put({ id: 'di1', deskId: 'book:b1', type: 'question', text: 'Why?', inInbox: true, createdAt: 2, updatedAt: 2 });
    old.close();

    const db = new DeskDB(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.items.get('di1'))?.text).toBe('Why?');
    expect((await db.desks.get('book:b1'))?.kind).toBe('book');
    expect(await db.links.count()).toBe(0);
    expect(await db.journal.count()).toBe(0);
    await db.items.update('di1', { threads: ['t1'] });
    expect((await db.items.where('threads').equals('t1').toArray()).map((i) => i.id)).toEqual(['di1']);
    db.close();
  });
});

describe('thinking store', () => {
  let n = 0;
  beforeEach(() => setDeskDBForTests(new DeskDB(`thinking-test-${++n}`)));
  afterEach(() => setDeskDBForTests(null));

  it('makes threads with names and a question, listed after book and own desks', async () => {
    const desk = await ensureBookDesk(book);
    const t = await createThread({ title: 'Everything on intention', titleAr: 'النية', question: 'Name it, or aim it?' });
    expect(t.kind).toBe('thread');
    expect(t.titleAr).toBe('النية');
    await updateDesk(t.id, { question: 'What does the niyya do?' });
    expect((await getDesk(t.id))?.question).toBe('What does the niyya do?');
    expect((await listDesks()).map((d) => d.id)).toEqual([desk.id, t.id]);
    const ar = await createThread({ title: '', titleAr: 'الإخلاص' });
    expect(ar.title).toBe('الإخلاص');
  });

  it('joins items to several threads, at the end of each document, and takes them out again', async () => {
    const desk = await ensureBookDesk(book);
    const a = await createThread({ title: 'A' });
    const b = await createThread({ title: 'B' });
    const q = await addItem(desk.id, { type: 'quote', text: 'إنما الأعمال بالنيات', source: { bookId: 'b1', location: 'pdf:61:0.1:0.2:0.5:0.05' } });
    await joinThread([q.id], a.id);
    await joinThread([q.id, q.id], b.id);
    await joinThread([q.id], a.id);
    const item = await getItem(q.id);
    expect(item?.threads).toEqual([a.id, b.id]);
    expect(Object.keys(item?.joined ?? {})).toEqual([a.id, b.id]);
    expect(await embeds(a.id)).toEqual([q.id]);
    expect(await embeds(b.id)).toEqual([q.id]);
    // The item stays on its own desk.
    expect(item?.deskId).toBe(desk.id);
    expect(await embeds(desk.id)).toEqual([q.id]);
    await leaveThread(q.id, a.id);
    expect((await getItem(q.id))?.threads).toEqual([b.id]);
    expect(await embeds(a.id)).toEqual([]);
    expect(await embeds(desk.id)).toEqual([q.id]);
  });

  it('lets members go when a thread is deleted', async () => {
    const desk = await ensureBookDesk(book);
    const t = await createThread({ title: 'T' });
    const q = await addItem(desk.id, { type: 'note', text: '', body: 'x' });
    await joinThread([q.id], t.id);
    await deleteDesk(t.id);
    expect((await getItem(q.id))?.threads).toEqual([]);
  });

  it('brings a deleted thread back with its document and its members', async () => {
    const desk = await ensureBookDesk(book);
    const t = await createThread({ title: 'T', titleAr: 'ت', question: 'Why?' });
    const q = await addItem(desk.id, { type: 'note', text: '', body: 'x' });
    const other = await addItem(desk.id, { type: 'note', text: '', body: 'y' });
    await joinThread([q.id, other.id], t.id);
    const own = await addItem(t.id, { type: 'concept', text: 'on the thread itself' });
    const joinedAt = (await getItem(q.id))!.joined![t.id];
    const gone = await deleteDeskKeepingUndo(t.id);
    expect(gone?.desk.id).toBe(t.id);
    expect(gone?.members.map((m) => m.id).sort()).toEqual([q.id, other.id].sort());
    expect(await getDesk(t.id)).toBeUndefined();
    expect(await getItem(own.id)).toBeUndefined();
    // One member was deleted meanwhile: it stays gone.
    await deleteItem(other.id);
    await restoreDeletedDesk(gone!);
    expect((await getDesk(t.id))?.question).toBe('Why?');
    expect((await getItem(own.id))?.text).toBe('on the thread itself');
    expect(await embeds(t.id)).toEqual([q.id, other.id, own.id]);
    expect((await getItem(q.id))?.threads).toEqual([t.id]);
    expect((await getItem(q.id))?.joined?.[t.id]).toBe(joinedAt);
    expect(await getItem(other.id)).toBeUndefined();
    expect(await deleteDeskKeepingUndo('nope')).toBeUndefined();
  });

  it('archives a thread and brings it back, keeping everything', async () => {
    const t = await createThread({ title: 'T', question: 'Why?' });
    await setDeskArchived(t.id, true);
    const archived = (await getDesk(t.id))!;
    expect(archived.archivedAt).toBeGreaterThan(0);
    expect(archived.question).toBe('Why?');
    await setDeskArchived(t.id, false);
    expect('archivedAt' in (await getDesk(t.id))!).toBe(false);
    await setDeskArchived('nope', true);
  });

  it('tells listeners about every item added', async () => {
    const desk = await ensureBookDesk(book);
    const seen: string[] = [];
    const off = onItemAdded((i) => seen.push(i.id));
    const one = await addItem(desk.id, { type: 'concept', text: 'Niyya' });
    off();
    await addItem(desk.id, { type: 'concept', text: 'Ikhlāṣ' });
    expect(seen).toEqual([one.id]);
  });

  it('keeps links and journal lines, and puts a deleted link back', async () => {
    const l = await addLink({ a: 'x', b: 'y', rel: 'differs', note: 'By what it does, or what it is' });
    expect((await listLinks()).map((x) => x.id)).toEqual([l.id]);
    await deleteLink(l.id);
    expect(await listLinks()).toEqual([]);
    await restoreLink(l);
    expect((await readAll('links')).length).toBe(1);
    await addJournal({ at: 20, bookId: 'b1', pages: 4, minutes: 38, text: 'Two jobs, not one' });
    await addJournal({ at: 10, bookId: 'b1', pages: 0, minutes: 6, text: 'Earlier' });
    expect((await listJournal()).map((j) => j.text)).toEqual(['Earlier', 'Two jobs, not one']);
  });
});
