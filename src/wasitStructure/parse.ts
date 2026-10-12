import type { DictionaryEntry } from '../types';
import { normalize } from '../reader/tokenizer/arabicTokenizer';
import { badgeOf } from '../dictionary/senseFormat/wasitLabels';

export type WordRole = 'head' | 'body' | 'plural' | 'plural-mark' | 'tag' | 'example';

export interface WordAnnotation {
  role: WordRole;
  /** Tooltip spelling out an abbreviation such as (مج). */
  title?: string;
  /** What to show instead of the token's text (the label's letters without brackets). */
  display?: string;
}

export interface SenseAnnotation {
  /** Sense opens a new derived form: "(كَتَبَ) ...". */
  isLead: boolean;
  /** Sense continues the previous form: "و- السقاءَ ...". */
  isContinuation: boolean;
  /** One entry per whitespace-separated word of the gloss, in order. */
  words: WordAnnotation[];
}

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

export function annotateGloss(gloss: string, labels = true): SenseAnnotation {
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
    // The headword line has no full stop in it: a later colon belongs to an example ("... (مو). ويقال:").
    if (endsSentence(words[i]) || badgeOf(key(words[i]))) break;
  }

  const out: WordAnnotation[] = [];
  let mode: 'plural' | 'example' | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (i <= headEnd) {
      out.push({ role: 'head' });
      continue;
    }
    // A bracketed letter opening the gloss is its lead form ("(د) وتُزادُ ..."), not a label.
    const badge = labels && (i > 0 || endsSentence(w)) ? badgeOf(key(w)) : null;
    if (badge?.kind === 'plural') {
      mode = 'plural';
      out.push({ role: 'plural-mark', title: badge.title, display: badge.text });
      continue;
    }
    if (mode === null) {
      if (PLURAL_MARKERS.has(key(w))) mode = 'plural';
      else if (exampleMarkerLength(words, i) > 0) mode = 'example';
    }
    if (badge) {
      out.push({ role: 'tag', title: badge.title, display: badge.text });
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
export function annotateEntry(entry: DictionaryEntry, labels = true): SenseAnnotation[] | null {
  const senses = entry.senses.map((s) => annotateGloss(s.gloss, labels));
  return senses.some((s) => s.isLead || s.isContinuation) ? senses : null;
}
