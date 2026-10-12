import { newId } from '../utils/id';
import { DeskDB } from './db';
import { appendEmbed, EMPTY_DOC, hasEmbed, removeEmbed, replaceEmbedWithHeading, sanitizeDocHtml } from './docHtml';
import type { Desk, DeskItem, DeskLink, JournalEntry, NewDeskItem } from './types';

let db: DeskDB | null = null;
function deskDb(): DeskDB {
  if (!db) db = new DeskDB();
  return db;
}

/** Tests swap in their own database; pass null to go back to the app's. */
export function setDeskDBForTests(replacement: DeskDB | null): void {
  db = replacement;
}

// --- change notifications ------------------------------------------------------------------------------
const listeners = new Set<() => void>();
export function onDeskChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
function changed(): void {
  listeners.forEach((l) => l());
}
/** Every item as it is added, after it is saved (the thinking desk joins new ones to the active thread). */
const addedListeners = new Set<(item: DeskItem) => void>();
export function onItemAdded(listener: (item: DeskItem) => void): () => void {
  addedListeners.add(listener);
  return () => void addedListeners.delete(listener);
}

// --- desks ---------------------------------------------------------------------------------------------
export const bookDeskId = (bookId: string): string => `book:${bookId}`;

export async function listDesks(): Promise<Desk[]> {
  const all = await deskDb().desks.toArray();
  const rank = { book: 0, own: 1, thread: 2 };
  return all.sort((a, b) => rank[a.kind] - rank[b.kind] || a.createdAt - b.createdAt);
}

export async function getDesk(id: string): Promise<Desk | undefined> {
  return deskDb().desks.get(id);
}

/** The book's own desk, made on first use. */
export async function ensureBookDesk(book: { id: string; title: string }): Promise<Desk> {
  const id = bookDeskId(book.id);
  const found = await deskDb().desks.get(id);
  if (found) return found;
  const now = Date.now();
  const desk: Desk = { id, kind: 'book', bookId: book.id, title: book.title, html: EMPTY_DOC, createdAt: now, updatedAt: now };
  await deskDb().desks.put(desk);
  changed();
  return desk;
}

/** A desk of the reader's own (an essay, a topic) that takes captures from any book. */
export async function createOwnDesk(title = 'Untitled desk'): Promise<Desk> {
  const now = Date.now();
  const desk: Desk = { id: newId('desk'), kind: 'own', title, html: EMPTY_DOC, createdAt: now, updatedAt: now };
  await deskDb().desks.put(desk);
  changed();
  return desk;
}

export async function renameDesk(id: string, title: string): Promise<void> {
  await deskDb().desks.update(id, { title: title.trim() || 'Untitled desk', updatedAt: Date.now() });
  changed();
}

/** Saves what the reader typed. The HTML is cleaned first. Quiet: the editor that typed it already shows it. */
export async function saveDeskHtml(id: string, html: string, { quiet = false } = {}): Promise<void> {
  await deskDb().desks.update(id, { html: sanitizeDocHtml(html), updatedAt: Date.now() });
  if (!quiet) changed();
}

export async function deleteDesk(id: string): Promise<void> {
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    await deskDb().items.where('deskId').equals(id).delete();
    // A thread's members stay on their own desks and leave the thread.
    await deskDb().items.where('threads').equals(id).modify((i) => void (i.threads = i.threads?.filter((t) => t !== id)));
    await deskDb().desks.delete(id);
  });
  changed();
}

// --- items ---------------------------------------------------------------------------------------------
export async function listItems(deskId?: string): Promise<DeskItem[]> {
  const rows = deskId ? await deskDb().items.where('deskId').equals(deskId).toArray() : await deskDb().items.toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getItem(id: string): Promise<DeskItem | undefined> {
  return deskDb().items.get(id);
}

/** Items placed in a margin of this book. */
export async function listPinnedForBook(bookId: string): Promise<DeskItem[]> {
  return (await deskDb().items.toArray()).filter((i) => i.pin?.bookId === bookId);
}

/**
 * Adds an item to a desk: into the inbox (unless it is a margin note) and, at the same moment, at the end of
 * the desk's document, so the document stays in the order things were captured until the reader moves them.
 */
export async function addItem(deskId: string, input: NewDeskItem): Promise<DeskItem> {
  const now = Date.now();
  const item: DeskItem = { ...input, id: newId('di'), deskId, inInbox: input.inInbox ?? !input.fromMargin, createdAt: now, updatedAt: now };
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const desk = await deskDb().desks.get(deskId);
    if (!desk) throw new Error(`No desk ${deskId}`);
    await deskDb().items.put(item);
    await deskDb().desks.update(deskId, { html: appendEmbed(desk.html, item.id), updatedAt: now });
  });
  changed();
  addedListeners.forEach((l) => l(item));
  return item;
}

export async function updateItem(id: string, patch: Partial<Omit<DeskItem, 'id' | 'createdAt'>>): Promise<void> {
  await deskDb().items.update(id, { ...patch, updatedAt: Date.now() });
  changed();
}

/** Several items changed at once (a pile made, a card taken off one), with one change notification. */
export async function patchItems(patches: { id: string; patch: Partial<Omit<DeskItem, 'id' | 'createdAt'>> }[]): Promise<void> {
  if (!patches.length) return;
  const now = Date.now();
  await deskDb().transaction('rw', deskDb().items, async () => {
    for (const { id, patch } of patches) {
      const item = await deskDb().items.get(id);
      if (!item) continue;
      // Undefined in a patch clears the field (Dexie's update would keep it).
      const next = { ...item, ...patch, updatedAt: now } as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
      await deskDb().items.put(next as unknown as DeskItem);
    }
  });
  changed();
}

/**
 * Undo of a delete: the items come back as they were, and each desk's document (as it was before the delete) gets
 * that text back if nothing else changed it since; otherwise the items go back at the end of it.
 */
export async function restoreItems(items: DeskItem[], desks: Desk[]): Promise<void> {
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    await deskDb().items.bulkPut(items);
    for (const before of desks) {
      const now = await deskDb().desks.get(before.id);
      if (!now) continue;
      let html = now.html;
      // Untouched since the delete: the text then is the text before without these items.
      const ids = items.filter((i) => i.deskId === before.id).map((i) => i.id);
      if (ids.reduce((h, id) => removeEmbed(h, id), before.html) === now.html) html = before.html;
      for (const item of items) if (item.deskId === before.id && !hasEmbed(html, item.id)) html = appendEmbed(html, item.id);
      if (html !== now.html) await deskDb().desks.update(before.id, { html, updatedAt: Date.now() });
    }
  });
  changed();
}

export async function deleteItem(id: string): Promise<void> {
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const item = await deskDb().items.get(id);
    if (!item) return;
    const desk = await deskDb().desks.get(item.deskId);
    if (desk) await deskDb().desks.update(desk.id, { html: removeEmbed(desk.html, id), updatedAt: Date.now() });
    await deskDb().items.delete(id);
  });
  changed();
}

/** A margin note turned into a heading: the heading takes the note's place in the document and the note goes. */
export async function turnItemIntoHeading(id: string, text: string): Promise<void> {
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const item = await deskDb().items.get(id);
    if (!item) return;
    const desk = await deskDb().desks.get(item.deskId);
    if (desk) await deskDb().desks.update(desk.id, { html: replaceEmbedWithHeading(desk.html, id, text), updatedAt: Date.now() });
    await deskDb().items.delete(id);
  });
  changed();
}

/** Moves an item to another desk, at the end of that desk's document. */
export async function sendItemToDesk(id: string, deskId: string): Promise<void> {
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const item = await deskDb().items.get(id);
    const to = await deskDb().desks.get(deskId);
    if (!item || !to || item.deskId === deskId) return;
    const from = await deskDb().desks.get(item.deskId);
    if (from) await deskDb().desks.update(from.id, { html: removeEmbed(from.html, id), updatedAt: Date.now() });
    await deskDb().desks.update(to.id, { html: appendEmbed(to.html, id), updatedAt: Date.now() });
    await deskDb().items.update(id, { deskId, updatedAt: Date.now() });
  });
  changed();
}

/** Puts an item that was deleted from the document text back at the end of its desk. */
export async function putBackInDocument(id: string): Promise<void> {
  const item = await deskDb().items.get(id);
  const desk = item && (await deskDb().desks.get(item.deskId));
  if (!item || !desk || hasEmbed(desk.html, id)) return;
  await deskDb().desks.update(desk.id, { html: appendEmbed(desk.html, id), updatedAt: Date.now() });
  changed();
}

// --- the thinking desk (docs/features/thinking-front.md): threads, links, the journal ----------------------

/** A thread: a desk that belongs to a question instead of a book, gathering from any book. */
export async function createThread(input: { title: string; titleAr?: string; question?: string }): Promise<Desk> {
  const now = Date.now();
  const desk: Desk = { id: newId('thread'), kind: 'thread', title: input.title.trim() || input.titleAr?.trim() || 'Untitled thread', html: EMPTY_DOC, createdAt: now, updatedAt: now };
  if (input.titleAr?.trim()) desk.titleAr = input.titleAr.trim();
  if (input.question?.trim()) desk.question = input.question.trim();
  await deskDb().desks.put(desk);
  changed();
  return desk;
}

/** Names and question of a thread (or any desk's title). */
export async function updateDesk(id: string, patch: Partial<Pick<Desk, 'title' | 'titleAr' | 'question'>>): Promise<void> {
  await deskDb().desks.update(id, { ...patch, updatedAt: Date.now() });
  changed();
}

/** Items join a thread: the thread id on each, when it joined, and its embed at the end of the thread's document. */
export async function joinThread(itemIds: string[], threadId: string): Promise<void> {
  const now = Date.now();
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const thread = await deskDb().desks.get(threadId);
    if (!thread) return;
    let html = thread.html;
    for (const id of itemIds) {
      const item = await deskDb().items.get(id);
      if (!item || item.threads?.includes(threadId)) continue;
      await deskDb().items.put({ ...item, threads: [...(item.threads ?? []), threadId], joined: { ...item.joined, [threadId]: now }, updatedAt: now });
      if (!hasEmbed(html, id)) html = appendEmbed(html, id);
    }
    if (html !== thread.html) await deskDb().desks.update(threadId, { html, updatedAt: now });
  });
  changed();
}

/** An item leaves a thread, and the thread's document. */
export async function leaveThread(itemId: string, threadId: string): Promise<void> {
  const now = Date.now();
  await deskDb().transaction('rw', deskDb().desks, deskDb().items, async () => {
    const item = await deskDb().items.get(itemId);
    if (item?.threads?.includes(threadId)) {
      const joined = { ...item.joined };
      delete joined[threadId];
      await deskDb().items.put({ ...item, threads: item.threads.filter((t) => t !== threadId), joined, updatedAt: now });
    }
    const thread = await deskDb().desks.get(threadId);
    if (thread && thread.kind === 'thread' && hasEmbed(thread.html, itemId)) await deskDb().desks.update(threadId, { html: removeEmbed(thread.html, itemId), updatedAt: now });
  });
  changed();
}

export const listLinks = (): Promise<DeskLink[]> => deskDb().links.toArray();

export async function addLink(input: Pick<DeskLink, 'a' | 'b' | 'rel' | 'note'>): Promise<DeskLink> {
  const now = Date.now();
  const link: DeskLink = { ...input, id: newId('link'), createdAt: now, updatedAt: now };
  await deskDb().links.put(link);
  changed();
  return link;
}

export async function updateLink(id: string, patch: Partial<Pick<DeskLink, 'rel' | 'note'>>): Promise<void> {
  await deskDb().links.update(id, { ...patch, updatedAt: Date.now() });
  changed();
}

export async function deleteLink(id: string): Promise<void> {
  await deskDb().links.delete(id);
  changed();
}

/** Undo of a link deleted. */
export async function restoreLink(link: DeskLink): Promise<void> {
  await deskDb().links.put(link);
  changed();
}

export const listJournal = (): Promise<JournalEntry[]> => deskDb().journal.orderBy('at').toArray();

export async function addJournal(input: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalEntry> {
  const now = Date.now();
  const entry: JournalEntry = { ...input, id: newId('jr'), createdAt: now, updatedAt: now };
  await deskDb().journal.put(entry);
  changed();
  return entry;
}

// --- export and import (src/dataExport) ---------------------------------------------------------------
export type DeskTableName = 'items' | 'desks' | 'links' | 'journal';
export const readAllItems = (): Promise<DeskItem[]> => deskDb().items.toArray();
export const readAllDesks = (): Promise<Desk[]> => deskDb().desks.toArray();
export const readAll = (table: DeskTableName): Promise<Record<string, unknown>[]> => deskDb().table(table).toArray();
export async function bulkGet(table: DeskTableName, keys: string[]): Promise<(Record<string, unknown> | undefined)[]> {
  return (await deskDb().table(table).bulkGet(keys)) as (Record<string, unknown> | undefined)[];
}
export async function bulkPut(table: DeskTableName, rows: Record<string, unknown>[]): Promise<void> {
  const clean = table === 'desks' ? rows.map((r) => ({ ...r, html: sanitizeDocHtml(String(r.html ?? '')) })) : rows;
  await deskDb().table(table).bulkPut(clean);
  changed();
}
