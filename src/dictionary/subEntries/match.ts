import type { DictionaryEntry } from '../../types';
import { weakLastRadicalVariants } from '../providers/alwasit/lookupKeys';
import { hasSubEntryHeads, unitHead, type SubEntryHead } from './heads';
import { traitsOf } from '../providerTraits';
import { articleVariants, cliticVariants, subEntryKey, vowelsAgree } from './keys';

/** The parts of an AraMorph analysis (MorphologicalAnalysis) matching reads. */
export interface AnalysisLike {
  lemma?: string;
  root?: string;
  altRoot?: string;
  /** Verb form, I-X; absent for anything but a verb. */
  form?: string;
  /** The reading contradicts the vowels written on the tapped word. */
  vowelClash?: boolean;
  /** AraMorph's tags for the reading's prefix, stem and suffix: "wa/CONJ+, li>an~a/CONJ". */
  pos?: string;
}

/** Stem tags of particles, pronouns and conjunctions -- words no root article is about. */
const FUNCTION_TAG_RE = /^[^/+]*\/(?:[A-Z_]*CONJ|PREP|[A-Z_]*PRON(?:_\w+)?|[A-Z_]*PART|INTERROG\w*|ADV\w*)(?:\+|$|_)/;

/** True when AraMorph read the word as a function word (لأن، أنتما، الذي، فيه): the tag of its stem, after any prefixes. */
export function isFunctionWord(a: AnalysisLike): boolean {
  const stem = (a.pos ?? '').split(/,\s*/).find((seg) => seg && !seg.endsWith('+') && !seg.startsWith('+'));
  return !!stem && FUNCTION_TAG_RE.test(stem);
}

const FORM_NUMBER: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

/** What the reader looked up, as keys (see subEntryKey). */
export interface Wanted {
  /** The tapped word (and without the article) and every lemma AraMorph read it as. */
  exact: Set<string>;
  /** The tapped word without a one-letter clitic -- a guess, used only when nothing exact matches. */
  loose: Set<string>;
  /** Lemma keys of the verb readings, and of the others. */
  verbLemmas: Set<string>;
  nounLemmas: Set<string>;
  /** Each verb reading's form number and the spellings of its root. */
  verbs: { form: number; roots: Set<string> }[];
  /** The readings' lemmas as written (vowels and all), best reading first. */
  lemmas: { key: string; text: string }[];
  /** The tapped word's own keys (as tapped, and without the article when AraMorph doesn't know it). */
  surface: Set<string>;
}

function rootSpellings(a: AnalysisLike): Set<string> {
  const out = new Set<string>();
  for (const r of [a.root, a.altRoot]) {
    if (!r) continue;
    const key = subEntryKey(r);
    out.add(key);
    for (const v of weakLastRadicalVariants(key)) out.add(subEntryKey(v));
  }
  return out;
}

export function wantedKeys(word: string, analyses: AnalysisLike[] = []): Wanted {
  // Readings that clash with the written vowels drop out, unless every reading does.
  const usable = analyses.some((a) => !a.vowelClash) ? analyses.filter((a) => !a.vowelClash) : analyses;
  const key = subEntryKey(word);
  // With an analysis, AraMorph's lemmas are the word without its clitics; stripping a leading ال by
  // hand would read ألبير (Albert) as ال + بير.
  const wanted: Wanted = {
    exact: new Set(!key ? [] : usable.length ? [key] : articleVariants(key)),
    loose: new Set(key ? cliticVariants(key) : []),
    verbLemmas: new Set(),
    nounLemmas: new Set(),
    verbs: [],
    lemmas: [],
    surface: new Set(),
  };
  wanted.surface = new Set(wanted.exact);
  for (const a of usable) {
    const form = a.form ? FORM_NUMBER[a.form] : undefined;
    const lemma = a.lemma ? subEntryKey(a.lemma) : '';
    // A lemma never carries the article: one starting with ال is a word of its own (ألبير، ألماس).
    if (lemma) {
      wanted.exact.add(lemma);
      wanted.lemmas.push({ key: lemma, text: a.lemma! });
      (form ? wanted.verbLemmas : wanted.nounLemmas).add(lemma);
    }
    if (form) wanted.verbs.push({ form, roots: rootSpellings(a) });
  }
  for (const k of wanted.exact) wanted.loose.delete(k);
  return wanted;
}

/**
 * How well one sub-entry matches: 4 = the verb form (or Hans Wehr's verb paragraph) of the tapped verb's
 * root; 3 = its headword is the word or a lemma of the same kind (verb/noun); 2 = its headword is the word or
 * a lemma; 1 = only a loose spelling matches; 0 = no match.
 */
export function matchTier(head: SubEntryHead | null, wanted: Wanted, providerId: string, articleRoot: string): number {
  if (!head) return 0;
  if (head.verbForm !== undefined) {
    const root = subEntryKey(articleRoot);
    if (wanted.verbs.some((v) => (head.verbForm === 0 || v.form === head.verbForm) && v.roots.has(root))) return 4;
  }
  if (head.keys.some((k) => wanted.exact.has(k))) {
    if (!traitsOf(providerId).marksVerbs) return 3;
    const lemmas = head.verbForm !== undefined ? wanted.verbLemmas : wanted.nounLemmas;
    return head.keys.some((k) => lemmas.has(k)) ? 3 : 2;
  }
  const all = [...head.keys, ...head.looseKeys];
  return all.some((k) => wanted.exact.has(k) || wanted.loose.has(k)) ? 1 : 0;
}

/**
 * Which reading a matched headword is, best first: the index of the first lemma it is spelled and
 * vowelled like (كِتَابٌ is reading 0 of كِتاب, كُتّاب, كاتِب; كُتَّابٌ is reading 1). Infinity when none fits.
 */
function readingRank(head: SubEntryHead | null, wanted: Wanted): number {
  if (!head) return Infinity;
  const i = wanted.lemmas.findIndex((l) => head.keys.includes(l.key) && (!head.word || vowelsAgree(l.text, head.word)));
  return i === -1 ? Infinity : i;
}

/**
 * The best tier among `heads` and the indexes that reach it (none when nothing matches). Among headwords
 * matched by spelling (tiers 2-3), those of the best-ranked reading win when the vowels tell them apart.
 */
export function bestMatches(
  heads: (SubEntryHead | null)[],
  wanted: Wanted,
  providerId: string,
  articleRoot: string,
): { tier: number; indexes: Set<number> } {
  let tier = 0;
  let indexes = new Set<number>();
  heads.forEach((head, i) => {
    const t = matchTier(head, wanted, providerId, articleRoot);
    if (t === 0 || t < tier) return;
    if (t > tier) {
      tier = t;
      indexes = new Set();
    }
    indexes.add(i);
  });
  // Hans Wehr: the opening verb paragraph (form 0) covers every form only while no line of its own does.
  if (tier === 4 && [...indexes].some((i) => heads[i]?.verbForm)) {
    indexes = new Set([...indexes].filter((i) => heads[i]?.verbForm !== 0));
  }
  if (tier === 2 || tier === 3) {
    const ranks = new Map([...indexes].map((i) => [i, readingRank(heads[i], wanted)]));
    const best = Math.min(...ranks.values());
    if (best !== Infinity) indexes = new Set([...indexes].filter((i) => ranks.get(i) === best));
    // Matched through a lemma whose vowels it contradicts (العَالَمُ for عالِم) and not spelled as tapped: not it.
    else indexes = new Set([...indexes].filter((i) => !heads[i]?.word || heads[i]!.keys.some((k) => wanted.surface.has(k)) || !wanted.lemmas.length));
    if (!indexes.size) tier = 0;
  }
  return { tier, indexes };
}

/** An entry's senses read as sub-entry heads (see unitHead). */
export function senseHeads(entry: DictionaryEntry): (SubEntryHead | null)[] {
  const root = entry.root ?? entry.headword;
  return entry.senses.map((s, i) => unitHead(entry.providerId, s.gloss, root, i));
}

/**
 * Indexes of the entry's senses about the word the reader looked up -- the tapped surface form itself, or
 * a lemma AraMorph resolved it to (tapping كَاتَبْتُهُ marks Al-Wasīṭ's "(كَاتَبَ)" sense, Lane's paragraph 3
 * and Hans Wehr's verb paragraph). Only the best-matching tier is returned. Diacritics, alef/hamza, ى/ي and
 * ة/ه are ignored.
 */
export function findMatchedSenses(entry: DictionaryEntry, word: string, morphology: AnalysisLike[] = []): Set<number> {
  if (!hasSubEntryHeads(entry.providerId)) return new Set();
  return bestMatches(senseHeads(entry), wantedKeys(word, morphology), entry.providerId, entry.root ?? entry.headword).indexes;
}

/**
 * Which entries of a lookup result are about the word the reader looked up, as entry index -> the senses of it
 * to mark (an entry cut from a root article is one line or form, so its sense 0). Entries cut from the same
 * article (same dictionary and `articleKey`) are matched against each other, exactly as the article's lines
 * were before it was cut; an entry that is a whole article (Maqāyīs) marks its matching paragraphs.
 */
export function findMatchedEntries(entries: DictionaryEntry[], word: string, morphology: AnalysisLike[] = []): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const wanted = wantedKeys(word, morphology);
  let i = 0;
  while (i < entries.length) {
    const first = entries[i];
    if (!hasSubEntryHeads(first.providerId)) {
      i++;
      continue;
    }
    if (first.articleKey === undefined) {
      const senses = findMatchedSenses(first, word, morphology);
      if (senses.size) out.set(i, senses);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < entries.length && entries[j].providerId === first.providerId && entries[j].articleKey === first.articleKey) j++;
    const root = first.root ?? first.headword;
    const heads = entries.slice(i, j).map((e, k) => unitHead(e.providerId, e.senses[0]?.gloss ?? '', root, k));
    for (const k of bestMatches(heads, wanted, first.providerId, root).indexes) out.set(i + k, new Set([0]));
    i = j;
  }
  return out;
}

/**
 * The entries that are about the word the reader looked up, for folding a long list down to them: those
 * marked by findMatchedEntries, plus, in a dictionary whose lines have no headword to read (AraMorph, Baranov, a
 * file the reader loaded), the entries whose headword is the word itself.
 */
export function entriesAboutWord(entries: DictionaryEntry[], word: string, morphology: AnalysisLike[] = []): Set<number> {
  const out = new Set(findMatchedEntries(entries, word, morphology).keys());
  const key = subEntryKey(word);
  entries.forEach((e, i) => {
    if (key && !hasSubEntryHeads(e.providerId) && subEntryKey(e.headword) === key) out.add(i);
  });
  return out;
}
