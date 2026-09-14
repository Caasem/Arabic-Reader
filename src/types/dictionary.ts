export interface DictionaryEntrySense {
  gloss: string;
  pos?: string; // part of speech, e.g. "noun", "verb"
  gender?: string;
  notes?: string;
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
  /** Notifies when the provider's underlying data changes (e.g. a custom
   * dataset upload), so cached lookups can be discarded. */
  onDataChanged?(listener: () => void): () => void;
}

export interface MorphologyProvider {
  id: string;
  analyze(word: string): Promise<MorphologicalAnalysis[]>;
}
