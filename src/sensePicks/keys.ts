import type { DictionaryEntrySense } from '../types';
import { senseText } from '../dictionary/senseText';
import { sha256Bytes } from './sha256';

/**
 * Stable identifiers for a meaning, a word and a book (docs/specs/crowd-sense-ranking.md, section 5).
 * They are content hashes, not positions, so a pick still matches after a dictionary is regenerated
 * or its entries are reordered. They are short, not secret: a known title or word can be hashed and matched.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lower case, no padding. */
function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function shortHash(parts: string[], bytes: number): string {
  return base32(sha256Bytes(parts.join('|')).slice(0, bytes));
}

const TASHKEEL = /[ً-ٰٟـ]/g;

/** Unicode NFC, trimmed, whitespace collapsed, Latin lower-cased. Vowel marks are kept. */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** As `normalizeText`, with Arabic vowel marks and tatweel removed (used for headwords and lemmas). */
export function normalizeArabic(s: string): string {
  return normalizeText(s.replace(TASHKEEL, ''));
}

/** One meaning inside one dictionary. The provider is part of the key, so a key only means something inside it. */
export function senseKey(providerId: string, headword: string, sense: DictionaryEntrySense): string {
  return shortHash([providerId, normalizeArabic(headword), normalizeText(senseText(sense))], 10);
}

/**
 * One dictionary entry: a headword block with its own meanings (a verb form, a noun). This is the unit
 * a save names, since the round + saves a whole entry. Built from the entry's own fields, never its position.
 */
export function entryKey(entry: { providerId: string; headword: string; root?: string; verbForm?: string }): string {
  return shortHash([entry.providerId, normalizeArabic(entry.headword), normalizeArabic(entry.root ?? ''), normalizeText(entry.verbForm ?? '')], 10);
}

/** A word, from its lemma (or the word itself when there is none) and part of speech. */
export function lemmaKey(lemma: string, pos?: string): string {
  return shortHash([normalizeArabic(lemma), normalizeText(pos ?? '')], 10);
}

/** A work, not a file: title, author and language, so two files of the same book match. */
export function bookKey(book: { title: string; author?: string; language?: string }): string {
  return shortHash([normalizeText(book.title), normalizeText(book.author ?? ''), normalizeText(book.language ?? '')], 12);
}
