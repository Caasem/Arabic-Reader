import type { DictionaryEntry } from '../types';
import { normalize } from '../reader/tokenizer/arabicTokenizer';

export type WordRole = 'head' | 'body' | 'plural' | 'tag' | 'example';

export interface WordAnnotation {
  role: WordRole;
  /** Tooltip spelling out an abbreviation such as (مج). */
  title?: string;
}

export interface SenseAnnotation {
  /** Sense opens a new derived form: "(كَتَبَ) ...". */
  isLead: boolean;
  /** Sense continues the previous form: "و- السقاءَ ...". */
  isContinuation: boolean;
  /** One entry per whitespace-separated word of the gloss, in order. */
  words: WordAnnotation[];
}

/** Source-text abbreviations, keyed by their diacritic-free spelling. */
const TAGS: Record<string, string> = {
  'مج': 'Approved by the Arabic Language Academy',
  'محدثة': 'Modern coinage',
  'مو': 'Post-classical (muwallad)',
  'مع': 'Arabized loanword',
  'د': 'Borrowed word (dakhīl)',
};

const PLURAL_MARKERS = new Set(['(ج)', '(جج)']);
const HEAD_LOOKAHEAD = 14;

const key = (token: string) => normalize(token);
const endsSentence = (token: string) => /[.؟!]$/.test(token);

/** "ويقال:" / "وفي التنزيل العزيز:" -- what follows is a usage example or a verse. */
function exampleMarkerLength(words: string[], i: number): number {
  const w = key(words[i]);
  if (w === 'ويقال:' || w === 'يقال:') return 1;
  if (w === 'وفي' && key(words[i + 1] ?? '') === 'التنزيل' && key(words[i + 2] ?? '').startsWith('العزيز')) return 3;
  return 0;
}

export function annotateGloss(gloss: string): SenseAnnotation {
  const words = gloss.split(/\s+/).filter(Boolean);
  const trimmed = gloss.trimStart();
  const isLead = /^\([^()]+\)/.test(trimmed);
  const isContinuation = /^و\s*-/.test(trimmed);

  // The headword line (form, vowel pattern, verbal nouns) runs to the first ":".
  let headEnd = -1;
  for (let i = 0; i < Math.min(words.length, HEAD_LOOKAHEAD); i++) {
    if (words[i].endsWith(':')) {
      headEnd = i;
      break;
    }
  }

  const out: WordAnnotation[] = [];
  let mode: 'plural' | 'example' | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i <= headEnd) {
      out.push({ role: 'head' });
      continue;
    }
    if (mode === null) {
      if (PLURAL_MARKERS.has(key(w))) mode = 'plural';
      else if (exampleMarkerLength(words, i) > 0) mode = 'example';
    }
    const tag = /^\(([^()]+)\)[.،]?$/.exec(key(w));
    if (tag && TAGS[tag[1]]) {
      out.push({ role: 'tag', title: TAGS[tag[1]] });
      continue;
    }
    out.push({ role: mode ?? 'body' });
    if (mode && endsSentence(w)) mode = null;
  }
  return { isLead, isContinuation, words: out };
}

/**
 * Per-sense structure for an Al-Wasit entry, or null when the entry has
 * nothing recognisable to add (the popup then renders exactly as before).
 */
export function annotateEntry(entry: DictionaryEntry): SenseAnnotation[] | null {
  const senses = entry.senses.map((s) => annotateGloss(s.gloss));
  return senses.some((s) => s.isLead || s.isContinuation) ? senses : null;
}
