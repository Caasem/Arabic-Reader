import type { DictionaryEntry, DictionaryLookupResult } from '../types';
import type { VoteSource } from '../../crowd-server/src/protocol';
import { isSharingOn } from './consent';
import { enqueue } from './queue';
import { requestFlush } from './scheduler';

/** Dictionaries whose entries are shared. A dictionary the reader loaded themselves never is. */
const SHAREABLE = new Set(['aramorph', 'alwasit', 'alsihah', 'almaqayis', 'baranov']);

/** Where the entry stood among its dictionary's entries when it was shown, for position-bias correction (section 8.2). */
export function positionOf(result: DictionaryLookupResult, entry: DictionaryEntry): number {
  let n = 0;
  for (const e of result.entries) {
    if (e.providerId !== entry.providerId) continue;
    if (e === entry) return n;
    n++;
  }
  return 0;
}

interface Keys {
  bookKey: string;
  lemmaKey: string;
}

/**
 * Queues the vote for a save the reader just made (docs/specs/crowd-sense-ranking.md, section 10.5). Does nothing
 * unless sharing is on, and never throws: sharing must not get in the way of saving a word.
 */
export async function shareSave(
  keys: Keys,
  entry: DictionaryEntry,
  entryKeyValue: string,
  source: VoteSource,
  senseKeyValue: string | null,
  pos: number,
): Promise<void> {
  try {
    if (!isSharingOn() || !SHAREABLE.has(entry.providerId)) return;
    await enqueue({
      ...keys,
      providerId: entry.providerId,
      entryKey: entryKeyValue,
      senseKey: senseKeyValue,
      source,
      pos,
      action: 'save',
      ...(entry.verbForm ? { form: entry.verbForm } : {}),
    });
    requestFlush();
  } catch {
    // A lost vote is harmless.
  }
}

/** Queues a retraction for every entry the reader had saved for a word, when they remove the saved word (section 10.5). */
export async function shareUnsave(keys: Keys, rows: { providerId: string; entryKey: string; source: VoteSource }[]): Promise<void> {
  try {
    if (!isSharingOn()) return;
    for (const row of rows) {
      if (!SHAREABLE.has(row.providerId)) continue;
      await enqueue({ ...keys, providerId: row.providerId, entryKey: row.entryKey, senseKey: null, source: row.source, pos: 0, action: 'unsave' });
    }
    if (rows.length) requestFlush();
  } catch {
    // ignore
  }
}
