import { newId } from '../utils/id';
import { InkDB } from './db';
import type { InkStroke, Sketch } from './types';

let db: InkDB | null = null;
function inkDb(): InkDB {
  if (!db) db = new InkDB();
  return db;
}

/** Tests swap in their own database; pass null to go back to the app's. */
export function setInkDBForTests(replacement: InkDB | null): void {
  db = replacement;
}

// --- change notifications ------------------------------------------------------------------------------
const listeners = new Set<() => void>();
export function onInkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
function changed(): void {
  listeners.forEach((l) => l());
}

// --- strokes on pages ----------------------------------------------------------------------------------
export async function bookStrokes(bookId: string): Promise<InkStroke[]> {
  return inkDb().strokes.where('bookId').equals(bookId).sortBy('createdAt');
}

export async function addStroke(stroke: Omit<InkStroke, 'id' | 'createdAt' | 'updatedAt'>): Promise<InkStroke> {
  const now = Date.now();
  const row: InkStroke = { ...stroke, id: newId('ink'), createdAt: now, updatedAt: now };
  await inkDb().strokes.put(row);
  changed();
  return row;
}

export async function deleteStrokes(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await inkDb().strokes.bulkDelete(ids);
  changed();
}

/** Puts strokes back exactly as they were (undo of an erase). */
export async function restoreStrokes(rows: InkStroke[]): Promise<void> {
  if (!rows.length) return;
  await inkDb().strokes.bulkPut(rows);
  changed();
}

// --- sketches ------------------------------------------------------------------------------------------
export async function bookSketches(bookId: string): Promise<Sketch[]> {
  return inkDb().sketches.where('bookId').equals(bookId).sortBy('createdAt');
}

export async function saveSketch(sketch: Sketch): Promise<void> {
  await inkDb().sketches.put({ ...sketch, updatedAt: Date.now() });
  changed();
}

export async function deleteSketch(id: string): Promise<void> {
  await inkDb().sketches.delete(id);
  changed();
}

export function newSketch(bookId: string, key: string, location: string): Sketch {
  const now = Date.now();
  return { id: newId('sketch'), bookId, key, location, mode: 'draw', view: { tx: 24, ty: 24, s: 1 }, strokes: [], nodes: [], edges: [], createdAt: now, updatedAt: now };
}

export const isEmptySketch = (s: Sketch): boolean => !s.strokes.length && !s.nodes.length;

// --- full export and import (src/dataExport/stores.ts) -------------------------------------------------
type TableName = 'strokes' | 'sketches';

export const readAll = (table: TableName): Promise<Array<InkStroke | Sketch>> => inkDb()[table].toArray();

export async function bulkGet(table: TableName, ids: string[]): Promise<Array<InkStroke | Sketch | undefined>> {
  return table === 'strokes' ? inkDb().strokes.bulkGet(ids) : inkDb().sketches.bulkGet(ids);
}

export async function bulkPut(table: TableName, rows: Array<InkStroke | Sketch>): Promise<void> {
  if (!rows.length) return;
  if (table === 'strokes') await inkDb().strokes.bulkPut(rows as InkStroke[]);
  else await inkDb().sketches.bulkPut(rows as Sketch[]);
  changed();
}
