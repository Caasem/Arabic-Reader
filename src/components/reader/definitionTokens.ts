import type { DictionaryEntry } from '../../types';

/** One word or whitespace run inside a dictionary entry's definition.
 * `globalIdx` indexes the entry's flat token stream (spanning every sense),
 * which is what click/drag word selection tracks. Punctuation stays attached
 * to its word. */
export interface DefinitionToken {
  text: string;
  isWord: boolean;
  globalIdx: number;
}

/** Flattens every sense of an entry into one token stream (senses joined by
 * a single space so a selection spanning two senses doesn't run their text
 * together), plus the same token objects grouped per sense for rendering. */
export function buildEntryTokenSenses(entry: DictionaryEntry): { flat: DefinitionToken[]; bySense: DefinitionToken[][] } {
  const flat: DefinitionToken[] = [];
  const bySense: DefinitionToken[][] = [];
  entry.senses.forEach((s, si) => {
    if (si > 0) flat.push({ text: ' ', isWord: false, globalIdx: flat.length });
    const senseTokens: DefinitionToken[] = [];
    for (const part of s.gloss.split(/(\s+)/).filter((t) => t.length > 0)) {
      const token: DefinitionToken = { text: part, isWord: !!part.trim(), globalIdx: flat.length };
      flat.push(token);
      senseTokens.push(token);
    }
    bySense.push(senseTokens);
  });
  return { flat, bySense };
}

/** Rebuilds saveable text from a (possibly non-contiguous) set of selected
 * word-token indices. Directly adjacent selected words keep their original
 * spacing; a gap over unselected words collapses to a single space. */
export function reconstructSelection(tokens: DefinitionToken[], selected: Set<number>): string {
  let out = '';
  let lastIncluded = -2;
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.isWord) {
      if (!selected.has(idx)) continue;
      if (out && lastIncluded !== idx - 1) out += ' ';
      out += t.text;
      lastIncluded = idx;
    } else if (lastIncluded === idx - 1 && selected.has(idx + 1)) {
      out += t.text;
      lastIncluded = idx;
    }
  }
  return out;
}
