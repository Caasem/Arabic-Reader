import type { DictionaryEntrySense } from '../types';

/** A sense's display text: its gloss, or (when it is only examples) the examples' glosses. */
export function senseText(s: DictionaryEntrySense): string {
  return s.gloss || (s.examples ?? []).map((e) => e.gloss).join('; ');
}
