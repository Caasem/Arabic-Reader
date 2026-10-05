import { db } from './schema';

/** One chosen meaning, for one word in one dictionary in one book. The reader's own choice, kept on this device. */
export interface SensePickRow {
  /** `${bookKey}|${lemmaKey}|${providerId}`: one pick per word per dictionary per book. */
  key: string;
  bookKey: string;
  lemmaKey: string;
  providerId: string;
  senseKey: string;
  updatedAt: number;
}

const pickRowKey = (bookKey: string, lemmaKey: string, providerId: string): string => `${bookKey}|${lemmaKey}|${providerId}`;

/** This word's picks in this book, as dictionary id -> meaning key. */
export async function getSensePicks(bookKey: string, lemmaKey: string): Promise<Map<string, string>> {
  const rows = await db.sensePicks.where('key').startsWith(`${bookKey}|${lemmaKey}|`).toArray();
  return new Map(rows.map((r) => [r.providerId, r.senseKey]));
}

export async function setSensePick(pick: { bookKey: string; lemmaKey: string; providerId: string; senseKey: string }): Promise<void> {
  await db.sensePicks.put({ ...pick, key: pickRowKey(pick.bookKey, pick.lemmaKey, pick.providerId), updatedAt: Date.now() });
}

export async function clearSensePick(pick: { bookKey: string; lemmaKey: string; providerId: string }): Promise<void> {
  await db.sensePicks.delete(pickRowKey(pick.bookKey, pick.lemmaKey, pick.providerId));
}
