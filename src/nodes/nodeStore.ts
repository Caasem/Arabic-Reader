import { newId } from '../utils/id';
import { NodesDB } from './db';
import { canNest, deletionOf, detachNode, nestCard, nestNode, newNodeRec, nextOrder, restyle, type Rows } from './model';
import type { CardKind, CardRec, NodeAnchor, NodeRec, NodeStyle, Offset } from './types';

let db: NodesDB | null = null;
function nodesDb(): NodesDB {
  if (!db) db = new NodesDB();
  return db;
}

/** Tests swap in their own database; pass null to go back to the app's. */
export function setNodesDBForTests(replacement: NodesDB | null): void {
  db = replacement;
}

// --- change notifications ------------------------------------------------------------------------------
const listeners = new Set<() => void>();
export function onNodesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
const changed = () => listeners.forEach((l) => l());

// --- reading ---------------------------------------------------------------------------------------------
export async function bookRows(bookId: string): Promise<Rows> {
  const d = nodesDb();
  const [nodes, cards] = await Promise.all([d.nodes.where('bookId').equals(bookId).toArray(), d.cards.where('bookId').equals(bookId).toArray()]);
  return { nodes, cards };
}

// --- writing: a change is one transaction and one notification -------------------------------------------
interface Changes {
  putNodes?: NodeRec[];
  putCards?: CardRec[];
  deleteNodes?: string[];
  deleteCards?: string[];
}

async function apply(c: Changes): Promise<void> {
  const d = nodesDb();
  await d.transaction('rw', d.nodes, d.cards, async () => {
    if (c.putNodes?.length) await d.nodes.bulkPut(c.putNodes);
    if (c.putCards?.length) await d.cards.bulkPut(c.putCards);
    if (c.deleteNodes?.length) await d.nodes.bulkDelete(c.deleteNodes);
    if (c.deleteCards?.length) await d.cards.bulkDelete(c.deleteCards);
  });
  changed();
}

const without = <T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> => {
  const { [key]: _gone, ...rest } = row;
  return rest;
};

/** A new top-level node at a place in the book, closed, with its title showing. */
export async function addTopNode(bookId: string, anchor: NodeAnchor, style: NodeStyle, title: string): Promise<NodeRec> {
  const rows = await bookRows(bookId);
  const rec = newNodeRec({ id: newId('node'), bookId, parentId: null, title, style, order: nextOrder(rows, null), anchor, now: Date.now() });
  await apply({ putNodes: [rec] });
  return rec;
}

/** A new empty node inside another; it opens the way its parent does. */
export async function addChildNode(bookId: string, parentId: string, style: NodeStyle, title: string): Promise<NodeRec | null> {
  const rows = await bookRows(bookId);
  const parent = rows.nodes.find((n) => n.id === parentId);
  if (!parent) return null;
  const now = Date.now();
  const rec = newNodeRec({ id: newId('node'), bookId, parentId, title, style, order: nextOrder(rows, parentId), now });
  await apply({ putNodes: [rec, { ...parent, open: true, updatedAt: now }] });
  return rec;
}

export async function addCard(bookId: string, parentId: string, kind: CardKind, text: string): Promise<CardRec | null> {
  const rows = await bookRows(bookId);
  const parent = rows.nodes.find((n) => n.id === parentId);
  if (!parent) return null;
  const now = Date.now();
  const rec: CardRec = { id: newId('card'), bookId, parentId, kind, text, order: nextOrder(rows, parentId), createdAt: now, updatedAt: now };
  await apply({ putNodes: [{ ...parent, open: true, updatedAt: now }], putCards: [rec] });
  return rec;
}

type NodePatch = Partial<Pick<NodeRec, 'title' | 'open' | 'pinTitle' | 'carried'>>;
export async function patchNode(id: string, patch: NodePatch): Promise<void> {
  const row = await nodesDb().nodes.get(id);
  if (!row) return;
  await apply({ putNodes: [{ ...row, ...patch, updatedAt: Date.now() }] });
}

export async function setCardText(id: string, text: string): Promise<void> {
  const row = await nodesDb().cards.get(id);
  if (!row) return;
  await apply({ putCards: [{ ...row, text, updatedAt: Date.now() }] });
}

/** Moves a top-level node to another place in the book. */
export async function moveTopNode(id: string, anchor: NodeAnchor): Promise<void> {
  const row = await nodesDb().nodes.get(id);
  if (!row || row.parentId !== null) return;
  await apply({ putNodes: [{ ...row, anchor, updatedAt: Date.now() }] });
}

/** Sets (or, with null, clears) the hand-placed offset of a node or card. */
export async function setOffset(kind: 'node' | 'card', id: string, off: Offset | null): Promise<void> {
  const d = nodesDb();
  const now = Date.now();
  if (kind === 'node') {
    const row = await d.nodes.get(id);
    if (!row || row.parentId === null) return;
    await apply({ putNodes: [{ ...(off ? row : without(row, 'off')), ...(off ? { off } : {}), updatedAt: now }] });
  } else {
    const row = await d.cards.get(id);
    if (!row) return;
    await apply({ putCards: [{ ...(off ? row : without(row, 'off')), ...(off ? { off } : {}), updatedAt: now }] });
  }
}

/** Changes how a node opens; what hangs from it loses its hand-placed offsets (see model.restyle). */
export async function setStyle(bookId: string, id: string, style: NodeStyle): Promise<void> {
  const changes = restyle(await bookRows(bookId), id, style, Date.now());
  await apply({ putNodes: changes.nodes, putCards: changes.cards });
}

/** Puts a node or card inside another node, and opens that node so the drop is seen. False when not allowed. */
export async function nest(bookId: string, kind: 'node' | 'card', id: string, targetId: string): Promise<boolean> {
  const rows = await bookRows(bookId);
  const now = Date.now();
  const target = rows.nodes.find((n) => n.id === targetId);
  if (!target) return false;
  const opened = { ...target, open: true, updatedAt: now };
  if (kind === 'node') {
    const moved = nestNode(rows, id, targetId, now);
    if (!moved) return false;
    await apply({ putNodes: [moved, opened] });
  } else {
    const moved = nestCard(rows, id, targetId, now);
    if (!moved) return false;
    await apply({ putNodes: [opened], putCards: [moved] });
  }
  return true;
}

/** Frees a node from its parent and places it on the page. */
export async function detach(bookId: string, id: string, anchor: NodeAnchor): Promise<boolean> {
  const moved = detachNode(await bookRows(bookId), id, anchor, Date.now());
  if (!moved) return false;
  await apply({ putNodes: [moved] });
  return true;
}

/** Deletes a node with everything attached to it. Returns the rows removed, so the caller can offer Undo. */
export async function removeNode(bookId: string, id: string): Promise<Rows> {
  const rows = await bookRows(bookId);
  const gone = deletionOf(rows, id);
  const removed: Rows = { nodes: rows.nodes.filter((n) => gone.nodeIds.includes(n.id)), cards: rows.cards.filter((c) => gone.cardIds.includes(c.id)) };
  await apply({ deleteNodes: gone.nodeIds, deleteCards: gone.cardIds });
  return removed;
}

export async function removeCard(id: string): Promise<CardRec | undefined> {
  const row = await nodesDb().cards.get(id);
  if (row) await apply({ deleteCards: [id] });
  return row;
}

/** Puts rows back exactly as they were (undo of a delete). */
export async function restoreRows(rows: Rows): Promise<void> {
  await apply({ putNodes: rows.nodes, putCards: rows.cards });
}

export { canNest };

// --- full export and import (src/dataExport/stores.ts) -------------------------------------------------
type TableName = 'nodes' | 'cards';

export const readAll = (table: TableName): Promise<Array<NodeRec | CardRec>> => nodesDb()[table].toArray();

export async function bulkGet(table: TableName, ids: string[]): Promise<(Record<string, unknown> | undefined)[]> {
  return (await nodesDb().table(table).bulkGet(ids)) as (Record<string, unknown> | undefined)[];
}

export async function bulkPut(table: TableName, rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  await nodesDb().table(table).bulkPut(rows);
  changed();
}
