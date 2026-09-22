import type { WordInstance } from '../types';
import { db } from './schema';

function wordInstanceKey(bookId: string, normalizedForm: string): string {
  return `${bookId}::${normalizedForm}`;
}

function withoutKey({ key: _key, ...rest }: WordInstance & { key: string }): WordInstance {
  return rest;
}

export async function upsertWordInstance(instance: WordInstance): Promise<void> {
  await db.wordInstances.put({ ...instance, key: wordInstanceKey(instance.bookId, instance.normalizedForm) });
}
export async function getWordInstance(bookId: string, normalizedForm: string): Promise<WordInstance | undefined> {
  const row = await db.wordInstances.get(wordInstanceKey(bookId, normalizedForm));
  return row ? withoutKey(row) : undefined;
}
/** Patches an existing instance; a no-op when there isn't one. */
export async function updateWordInstance(
  bookId: string,
  normalizedForm: string,
  patch: Partial<WordInstance>,
): Promise<void> {
  await db.wordInstances.update(wordInstanceKey(bookId, normalizedForm), patch);
}
export async function getAllWordInstances(): Promise<WordInstance[]> {
  return (await db.wordInstances.toArray()).map(withoutKey);
}
export async function countWordInstances(): Promise<number> {
  return db.wordInstances.count();
}
export async function countSavedWordInstances(): Promise<number> {
  return db.wordInstances.filter((w) => w.saved).count();
}
export async function getWordInstancesBulk(
  bookId: string,
  normalizedForms: string[],
): Promise<Map<string, WordInstance>> {
  if (normalizedForms.length === 0) return new Map();
  const rows = await db.wordInstances.bulkGet(normalizedForms.map((f) => wordInstanceKey(bookId, f)));
  const out = new Map<string, WordInstance>();
  for (const row of rows) if (row) out.set(row.normalizedForm, withoutKey(row));
  return out;
}
export async function upsertWordInstancesBulk(instances: WordInstance[]): Promise<void> {
  if (instances.length === 0) return;
  await db.wordInstances.bulkPut(instances.map((i) => ({ ...i, key: wordInstanceKey(i.bookId, i.normalizedForm) })));
}
