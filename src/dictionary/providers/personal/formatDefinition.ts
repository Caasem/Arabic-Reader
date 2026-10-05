import type { DictionaryEntrySense } from '../../../types';
import { normalize } from '../../../reader/tokenizer/arabicTokenizer';

const VERB_PREFIX_RE = /^(X|IX|VIII|VII|VI|IV|V|III|II|I)\s+(?:([ауи])\s+)?/;
const VOWELS: Record<string, string> = { а: 'a', у: 'u', и: 'i' };
const SENSE_MARK_RE = /(?:^|\s)\d{1,2}\)\s*/g;
const CYRILLIC_RE = /[Ѐ-ӿ]/;

/**
 * Turns a dictionary article's running text into senses:
 *  - `~` stands for the headword in examples, so it is written out (unvocalized, as examples are);
 *  - a leading `I у` / `II` is a verb form (and imperfect vowel), shown as the part of speech;
 *  - `1) … 2) …` become separate senses, and an Arabic-only lead-in (the verbal noun) rides as a note.
 */
export function formatDefinition(headword: string, definition: string): DictionaryEntrySense[] {
  const plain = normalize(headword).trim();
  let text = plain ? definition.replace(/~(?=[\u0621-\u064A])/g, plain + ' ').replace(/~/g, plain) : definition;
  text = text.trim();

  let pos: string | undefined;
  const prefix = VERB_PREFIX_RE.exec(text);
  if (prefix) {
    pos = `verb, form ${prefix[1]}` + (prefix[2] ? `, imperfect ${VOWELS[prefix[2]]}` : '');
    text = text.slice(prefix[0].length);
  }

  const marks = Array.from(text.matchAll(SENSE_MARK_RE));
  const senses: DictionaryEntrySense[] = [];
  if (marks.length === 0) {
    if (text) senses.push({ gloss: clean(text) });
  } else {
    const preface = text.slice(0, marks[0].index).trim();
    marks.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      const gloss = clean(text.slice(start, end));
      if (gloss) senses.push({ gloss });
    });
    if (preface) {
      if (CYRILLIC_RE.test(preface) || senses.length === 0) senses.unshift({ gloss: clean(preface) });
      else senses[0].notes = preface;
    }
  }
  if (pos && senses.length) senses[0].pos = pos;
  return senses;
}

function clean(s: string): string {
  return s.trim().replace(/\s*;\s*$/, '');
}
