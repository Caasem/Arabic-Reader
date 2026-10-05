import type { DictionaryEntrySense } from '../../../types';
import { normalize } from '../../../reader/tokenizer/arabicTokenizer';

const VERB_PREFIX_RE = /^(X|IX|VIII|VII|VI|IV|V|III|II|I)\s+(?:([ауи])\s+)?/;
const VOWELS: Record<string, string> = { а: 'a', у: 'u', и: 'i' };
const SENSE_MARK_RE = /(?:^|\s)\d{1,2}\)\s*/g;
const CYRILLIC_RE = /[Ѐ-ӿ]/;
const ARABIC_START_RE = /^[^\p{L}]*[\u0600-\u06FF]/u;

/** The verb form (I-X) and imperfect vowel (`a`/`u`/`i`) a Baranov-style article opens with, if any. */
export function verbPrefix(definition: string): { form: string; vowel?: string } | undefined {
  const m = VERB_PREFIX_RE.exec(definition.trim());
  return m ? { form: m[1], vowel: m[2] ? VOWELS[m[2]] : undefined } : undefined;
}

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
    if (text) senses.push(makeSense(clean(text)));
  } else {
    const preface = text.slice(0, marks[0].index).trim();
    marks.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      const body = clean(text.slice(start, end));
      if (body) senses.push(makeSense(body));
    });
    if (preface) {
      if (CYRILLIC_RE.test(preface) || senses.length === 0) senses.unshift(makeSense(clean(preface)));
      else senses[0].notes = preface;
    }
  }
  if (pos && senses.length) senses[0].pos = pos;
  return senses;
}

function clean(s: string): string {
  return s.trim().replace(/\s*;\s*$/, '');
}

/**
 * Splits one sense's text at `;`. Segments that begin in Arabic and contain Russian are
 * examples (Arabic phrase, then its gloss); Russian-first segments are the sense itself,
 * or continue the previous example's gloss once examples have started.
 */
function makeSense(text: string): DictionaryEntrySense {
  const head: string[] = [];
  const examples: { ar: string; gloss: string }[] = [];
  for (const seg of text.split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean)) {
    const cyr = seg.search(CYRILLIC_RE);
    if (ARABIC_START_RE.test(seg) && cyr > 0) {
      examples.push({ ar: seg.slice(0, cyr).trim(), gloss: seg.slice(cyr).trim() });
    } else if (examples.length && cyr >= 0) {
      const last = examples[examples.length - 1];
      last.gloss += '; ' + seg;
    } else {
      head.push(seg);
    }
  }
  const sense: DictionaryEntrySense = { gloss: head.join('; ') };
  if (examples.length) sense.examples = examples;
  return sense;
}
