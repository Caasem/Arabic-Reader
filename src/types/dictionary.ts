export interface DictionaryEntrySense {
  gloss: string;
  pos?: string; // part of speech, e.g. "noun", "verb"
  gender?: string;
  notes?: string;
  /** Worked examples: an Arabic phrase with its gloss. */
  examples?: { ar: string; gloss: string }[];
}

export interface DictionaryEntry {
  providerId: string;
  providerName: string;
  headword: string; // as shown, vocalized if available
  senses: DictionaryEntrySense[];
  root?: string;
  /** The word's citation form (e.g. كاتَبَ for a matched كاتَبْتُهُ), as
   * opposed to `root`, the consonant skeleton (كتب) shared by every word
   * derived from it. Absent when the provider has no lemma data. */
  lemma?: string;
  /** For a verb: its form, I-X (see src/verbForms). Absent when unknown or not a verb. */
  verbForm?: string;
  /** Form I only: the imperfect vowel the dictionary marks (`u`, `a`, `i`, or two when either is used). */
  imperfectVowel?: string;
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
  pos?: string;
  form?: string; // verb form I-X, etc.
  tense?: string;
  person?: string;
  gender?: string;
  number?: string;
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
