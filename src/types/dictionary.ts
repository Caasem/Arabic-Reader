export interface DictionaryEntrySense {
  gloss: string;
  pos?: string; // part of speech, e.g. "noun", "verb"
  gender?: string;
  notes?: string;
  /** Worked examples: an Arabic phrase with its gloss. */
  examples?: { ar: string; gloss: string }[];
  /** Lane's Lexicon: [start, end) ranges of `gloss` that are its English meanings, shown in italics. */
  italics?: [number, number][];
}

/** The language a sense's text is written in: Arabic, or a left-to-right foreign one (English; Baranov's Russian too). */
export type SenseLanguage = 'ar' | 'en';

/**
 * One entry of a dictionary: the shared "sub-entry" shape every provider produces (see
 * src/dictionary/providerTraits.ts and the adapters in src/dictionary/providers). A long root article is
 * not one entry but many: one per line (Lane, Hans Wehr, Al-Ṣiḥāḥ) or per lead form with its continuations
 * (Al-Wasīṭ), each with its own headword, so the popup can save, fold, select words in and mark each one.
 * Al-Maqāyīs is the one exception: an article is an essay, kept as one entry whose paragraphs are the senses.
 */
export interface DictionaryEntry {
  providerId: string;
  providerName: string;
  headword: string; // as shown, vocalized if available
  senses: DictionaryEntrySense[];
  /** The language the senses are written in. Absent: the provider's default (see providerTraits). */
  language?: SenseLanguage;
  /** Entries cut from one root article share this key (the article's row), in article order. Absent for entries that are not part of one. */
  articleKey?: string;
  /** The first characters of `senses[0].gloss` that are the headword itself, so the popup does not draw them twice. Absent or 0: none. */
  headLength?: number;
  root?: string;
  /** The word's citation form (e.g. كاتَبَ for a matched كاتَبْتُهُ), as
   * opposed to `root`, the consonant skeleton (كتب) shared by every word
   * derived from it. Absent when the provider has no lemma data. */
  lemma?: string;
  /** For a verb: its form, I-X (see src/verbForms). Absent when unknown or not a verb. */
  verbForm?: string;
  /** Form I only: the imperfect vowel the dictionary marks (`u`, `a`, `i`, or two when either is used). */
  imperfectVowel?: string;
  /** The word was written with vowels and every reading in this entry contradicts them; shown after the others, muted. */
  vowelClash?: boolean;
}

/** One verb the dictionary lists for a root. */
export interface VerbFamilyMember {
  /** The citation form, Arabic. */
  lemma: string;
  form?: string;
  imperfectVowel?: string;
  gloss: string;
}

export interface MorphologicalAnalysis {
  surfaceForm: string;
  lemma: string;
  root?: string;
  /** The same root with و and ي swapped, where scholars or the data differ; searched after `root`. */
  altRoot?: string;
  pos?: string;
  form?: string; // verb form I-X, etc.
  tense?: string;
  person?: string;
  gender?: string;
  number?: string;
  /** The reading contradicts the vowels written on the tapped word (it is listed after those that don't). */
  vowelClash?: boolean;
}

export interface DictionaryLookupResult {
  word: string;
  entries: DictionaryEntry[];
  morphology?: MorphologicalAnalysis[];
  /** Enabled providers whose lookup failed (e.g. data unavailable offline). */
  failedProviders?: { id: string; name: string }[];
}

export interface DictionaryProvider {
  id: string;
  name: string;
  lookup(word: string): Promise<DictionaryEntry[]>;
  /** Entries whose definition mentions a Russian word or phrase (Arabic-Russian dictionaries only). */
  reverseSearch?(query: string): Promise<DictionaryEntry[]>;
  /** Notifies when the provider's underlying data changes (e.g. a custom
   * dataset upload), so cached lookups can be discarded. */
  onDataChanged?(listener: () => void): () => void;
  /** Headwords around `around` in the dictionary's own order, for browsing it like a book
   * (the full-page dictionary). Only dictionaries filed in a fixed order have it. */
  listHeadwords?(around: string, before: number, after: number): Promise<{ words: string[]; index: number } | null>;
}

export interface MorphologyProvider {
  id: string;
  analyze(word: string): Promise<MorphologicalAnalysis[]>;
}
