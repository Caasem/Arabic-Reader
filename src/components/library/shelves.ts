/** Edits to the reader's Library shelves, as pure functions over the stored list. */
import type { LibraryShelf } from '../../types';
import { newId } from '../../utils/id';

export const SHELF_COLORS = ['#5b2a2a', '#1f3f5f', '#3b3355', '#2f4b4a', '#6b5228', '#3d5a2a', '#7a3f1e', '#24464f'];

export function addShelf(shelves: readonly LibraryShelf[], name: string): { shelves: LibraryShelf[]; shelf?: LibraryShelf } {
  const trimmed = name.trim();
  if (!trimmed) return { shelves: [...shelves] };
  const existing = shelves.find((s) => s.name.localeCompare(trimmed, undefined, { sensitivity: 'base' }) === 0);
  if (existing) return { shelves: [...shelves], shelf: existing };
  const shelf: LibraryShelf = { id: newId('shelf'), name: trimmed, color: SHELF_COLORS[shelves.length % SHELF_COLORS.length], bookIds: [] };
  return { shelves: [...shelves, shelf], shelf };
}

export function renameShelf(shelves: readonly LibraryShelf[], id: string, name: string): LibraryShelf[] {
  const trimmed = name.trim();
  if (!trimmed) return [...shelves];
  return shelves.map((s) => (s.id === id ? { ...s, name: trimmed } : s));
}

/** Removes the shelf only; its books stay in the library. */
export function deleteShelf(shelves: readonly LibraryShelf[], id: string): LibraryShelf[] {
  return shelves.filter((s) => s.id !== id);
}

export function toggleBookOnShelf(shelves: readonly LibraryShelf[], shelfId: string, bookId: string): LibraryShelf[] {
  return shelves.map((s) => {
    if (s.id !== shelfId) return s;
    return s.bookIds.includes(bookId) ? { ...s, bookIds: s.bookIds.filter((b) => b !== bookId) } : { ...s, bookIds: [...s.bookIds, bookId] };
  });
}

/** A removed book leaves every shelf. Returns the same array when nothing changed. */
export function forgetBook(shelves: LibraryShelf[], bookId: string): LibraryShelf[] {
  if (!shelves.some((s) => s.bookIds.includes(bookId))) return shelves;
  return shelves.map((s) => (s.bookIds.includes(bookId) ? { ...s, bookIds: s.bookIds.filter((b) => b !== bookId) } : s));
}
