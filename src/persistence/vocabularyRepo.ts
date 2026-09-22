import type { VocabularyItem } from '../types';
import { db } from './schema';

export async function saveVocabularyItem(item: VocabularyItem): Promise<void> {
  await db.vocabulary.put(item);
}
export async function getVocabularyItem(id: string): Promise<VocabularyItem | undefined> {
  return db.vocabulary.get(id);
}
export async function getVocabulary(): Promise<VocabularyItem[]> {
  return db.vocabulary.orderBy('addedAt').reverse().toArray();
}
export async function getVocabularyForBook(bookId: string): Promise<VocabularyItem[]> {
  return db.vocabulary.where('bookId').equals(bookId).toArray();
}
/** Every card for this exact surface form in this book. */
export async function getVocabularyForWord(bookId: string, surfaceForm: string): Promise<VocabularyItem[]> {
  return db.vocabulary.where('[bookId+surfaceForm]').equals([bookId, surfaceForm]).toArray();
}
export async function deleteVocabularyItem(id: string): Promise<void> {
  await db.vocabulary.delete(id);
}
export async function isSaved(surfaceForm: string, bookId: string): Promise<boolean> {
  return (await db.vocabulary.where('[bookId+surfaceForm]').equals([bookId, surfaceForm]).count()) > 0;
}
export async function getDueVocabulary(now: number): Promise<VocabularyItem[]> {
  return db.vocabulary.where('fsrsDue').belowOrEqual(now).toArray();
}
