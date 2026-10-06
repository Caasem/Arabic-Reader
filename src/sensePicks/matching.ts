import type { DictionaryEntry, DictionaryEntrySense } from '../types';
import { normalizeText } from './keys';

/** Everything readable in one meaning: its text, its lead line and its examples. */
function haystack(s: DictionaryEntrySense): string {
  return [s.gloss, s.notes, ...(s.examples ?? []).flatMap((e) => [e.ar, e.gloss])].filter(Boolean).join(' ');
}

const words = (text: string): string[] =>
  normalizeText(text)
    .split(/[\s.,;:!?()[\]{}"'“”…·|/\\-]+/)
    .filter(Boolean);

/**
 * The one meaning in this entry that contains every word of a saved selection, or null when the words fit
 * no meaning or more than one. A selection that cannot be placed stays an entry-level save.
 */
export function senseContainingWords(entry: DictionaryEntry, selected: string): DictionaryEntrySense | null {
  const wanted = words(selected);
  if (wanted.length === 0) return null;
  const hits = entry.senses.filter((s) => {
    const have = new Set(words(haystack(s)));
    return wanted.every((w) => have.has(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The entry (and, when it can be named, the meaning inside it) that an edited card meaning was taken from.
 * A meaning counts as taken from a sense when it equals that sense's text or contains it, and the most specific
 * (longest) such sense is the one named. Returns null when nothing matches or the text could have come from
 * more than one entry.
 */
export function entryMatchingMeaning(
  entries: DictionaryEntry[],
  meaning: string,
): { entry: DictionaryEntry; sense: DictionaryEntrySense | null } | null {
  const text = normalizeText(meaning);
  if (!text) return null;
  const found = entries
    .map((entry) => {
      const hits = entry.senses
        .map((sense) => ({ sense, own: normalizeText(sense.gloss) }))
        .filter((h) => h.own.length >= 3 && (h.own === text || text.includes(h.own)));
      // The most specific meaning wins: an exact match, else the longest one the text contains.
      const longest = Math.max(0, ...hits.map((h) => h.own.length));
      return { entry, best: hits.filter((h) => h.own.length === longest) };
    })
    .filter((m) => m.best.length > 0);
  if (found.length !== 1) return null;
  return { entry: found[0].entry, sense: found[0].best.length === 1 ? found[0].best[0].sense : null };
}
