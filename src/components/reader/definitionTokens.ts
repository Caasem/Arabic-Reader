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

/** An entry whose senses carry examples (Baranov and files loaded by the user), tokenized in
 * reading order -- each sense's text, then each example's Arabic and its gloss -- so one
 * word selection can span them. `flat` is the whole stream; `senses` holds the same token
 * objects grouped for rendering. */
export interface ExampleEntryTokens {
  flat: DefinitionToken[];
  senses: { gloss: DefinitionToken[]; examples: { ar: DefinitionToken[]; gloss: DefinitionToken[] }[] }[];
}

export function buildExampleEntryTokens(entry: DictionaryEntry): ExampleEntryTokens {
  const flat: DefinitionToken[] = [];
  const space = () => flat.push({ text: ' ', isWord: false, globalIdx: flat.length });
  const tokenize = (text: string): DefinitionToken[] => {
    const out: DefinitionToken[] = [];
    for (const part of text.split(/(\s+)/).filter((t) => t.length > 0)) {
      const token: DefinitionToken = { text: part, isWord: !!part.trim(), globalIdx: flat.length };
      flat.push(token);
      out.push(token);
    }
    return out;
  };
  const senses = entry.senses.map((s) => {
    if (flat.length) space();
    const gloss = tokenize(s.gloss);
    const examples = (s.examples ?? []).map((ex) => {
      if (flat.length) space();
      const ar = tokenize(ex.ar);
      space();
      return { ar, gloss: tokenize(ex.gloss) };
    });
    return { gloss, examples };
  });
  return { flat, senses };
}
