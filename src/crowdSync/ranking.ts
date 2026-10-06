import { holdoutBucket } from '../../crowd-server/src/protocol';
import type { DictionaryLookupResult } from '../types';
import { applyWordRanking, type WordRanking } from './applyRanking';
import { isSharingOn } from './consent';
import { cachedPack, fetchPack, rankingState } from './packStore';
import { loadState } from './state';

/** Ranking files already looked at in this session, so a lookup does not read the database each time. */
const parsed = new Map<string, { hash: string; words: Record<string, Record<string, WordRanking>> }>();

async function wordsOf(path: string): Promise<Record<string, Record<string, WordRanking>> | null> {
  const row = await cachedPack(path);
  if (!row) return null;
  const hit = parsed.get(path);
  if (hit && hit.hash === row.hash) return hit.words;
  try {
    const words = (JSON.parse(row.text) as { words: Record<string, Record<string, WordRanking>> }).words ?? {};
    parsed.set(path, { hash: row.hash, words });
    return words;
  } catch {
    return null;
  }
}

/**
 * The lookup, reordered by what other readers saved (docs/specs/crowd-sense-ranking.md, section 10). It reads only what
 * is already on the device, so a lookup never waits for the network: a ranking file that is listed but not yet cached
 * is fetched in the background and used from the next lookup. Anything that is off, stale, denied or unknown leaves the
 * dictionary's own order. Installs in the hold-out group always see the dictionary order (section 8.2).
 */
export async function crowdRank(
  keys: { bookKey: string; lemmaKey: string },
  result: DictionaryLookupResult,
  now = Date.now(),
): Promise<DictionaryLookupResult> {
  try {
    if (!isSharingOn()) return result;
    const state = await loadState();
    if (rankingState(state, now) !== 'ok') return result;
    const manifest = state.manifest!;
    if (manifest.deny.bookKeys.includes(keys.bookKey) || manifest.deny.lemmaKeys.includes(keys.lemmaKey)) return result;
    if (state.installId && holdoutBucket(state.installId) < manifest.holdoutPercent) return result;

    const bookPath = `book/${keys.bookKey}`;
    const poolPath = `pooled/${keys.lemmaKey.slice(0, 2)}`;
    const found: Record<string, WordRanking | undefined> = {};
    for (const path of [poolPath, bookPath]) {
      if (!manifest.packs[path]) continue;
      const words = await wordsOf(path);
      if (!words) {
        void fetchPack(path); // used from the next lookup
        continue;
      }
      // The book's own ranking, where it has one, wins over the pooled one for that dictionary.
      for (const [providerId, ranking] of Object.entries(words[keys.lemmaKey] ?? {})) found[providerId] = ranking;
    }
    const entries = applyWordRanking(result.entries, found);
    return entries === result.entries ? result : { ...result, entries };
  } catch {
    return result;
  }
}
