import type { Bookmark } from '../types';
import { db } from './schema';

export async function saveBookmark(b: Bookmark): Promise<void> {
  await db.bookmarks.put(b);
}
export async function getBookmarksForBook(bookId: string): Promise<Bookmark[]> {
  return db.bookmarks.where('bookId').equals(bookId).sortBy('createdAt');
}
export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}
