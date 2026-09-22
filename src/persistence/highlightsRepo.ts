import type { Highlight } from '../types';
import { db } from './schema';

export async function saveHighlight(h: Highlight): Promise<void> {
  await db.highlights.put(h);
}
export async function getHighlight(id: string): Promise<Highlight | undefined> {
  return db.highlights.get(id);
}
export async function getHighlightsForBook(bookId: string): Promise<Highlight[]> {
  return db.highlights.where('bookId').equals(bookId).toArray();
}
export async function getAllHighlights(): Promise<Highlight[]> {
  return db.highlights.orderBy('createdAt').reverse().toArray();
}
export async function deleteHighlight(id: string): Promise<void> {
  await db.highlights.delete(id);
}
