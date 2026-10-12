import type { SenseLanguage } from '../types';
import type { SenseStyle } from './senseFormat/senseRuns';

/**
 * What each dictionary is, stated once. This module and the adapters under src/dictionary/providers are the
 * only places that may name a dictionary: every popup feature (folding, "+" per entry, word selection,
 * landing on the word, the dock, form chips ...) follows the shape of the entries (see DictionaryEntry) and
 * reads these data-level facts, never a provider id. src/dictionary/guard.test.ts enforces that.
 */
export interface ProviderTraits {
  /** Group heading in the clean popup; absent: the provider's own name. */
  label?: string;
  /** The language the sense text is written in. */
  language: SenseLanguage;
  /** Sense text whose direction follows its first strong letter (a file the reader loaded, in any language). */
  autoDirection?: boolean;
  /** How the typography treats a line (Lane's sigla, Hans Wehr's transliteration). */
  senseStyle: SenseStyle;
  /** How a line's opening headword is read (see unitHead in subEntries/heads.ts); absent: lines open with no headword to find. */
  headReader?: 'lane' | 'hanswehr' | 'sihah' | 'wasit' | 'maqayis';
  /** Lines are sub-entries worth indexing for the rootless fallback (see subEntries/subEntryIndex.ts). */
  indexed?: boolean;
  /** Tells a verb line from a noun line (Lane's form numbers, Hans Wehr's verb paragraph). */
  marksVerbs?: boolean;
  /**
   * How a root article becomes entries: `lines` = one entry per line; `forms` = one per lead form with its
   * continuations (Al-Wasīṭ); `essay` = the article is one entry, its paragraphs the senses (Maqāyīs).
   */
  articles?: 'lines' | 'forms' | 'essay';
  /** Al-Wasīṭ's lead/continuation structure, word roles and labels apply to the text. */
  structure?: boolean;
  /** Verses are set apart (Al-Ṣiḥāḥ). */
  verses?: boolean;
  /** Senses carry a lead note, a part-of-speech tag in front and worked examples (Baranov, a loaded file). */
  richSenses?: boolean;
  /** This dictionary's first sense is a short English gloss of the word (AraMorph): flash cards and margins use it. */
  shortGloss?: boolean;
  /** Which meaning the reader picks may be shared with the crowd ranking (never a dictionary the reader loaded). */
  sharesPicks?: boolean;
}

const DEFAULT_TRAITS: ProviderTraits = { language: 'en', senseStyle: 'plain' };

const TRAITS: Record<string, ProviderTraits> = {
  aramorph: { label: 'English', language: 'en', senseStyle: 'plain', shortGloss: true, sharesPicks: true },
  alwasit: { label: 'Al-Mu‘jam al-Wasīṭ · Arabic', language: 'ar', senseStyle: 'plain', headReader: 'wasit', indexed: true, articles: 'forms', structure: true, sharesPicks: true },
  alsihah: { label: 'Al-Ṣiḥāḥ · Arabic', language: 'ar', senseStyle: 'plain', headReader: 'sihah', indexed: true, articles: 'lines', verses: true, sharesPicks: true },
  almaqayis: { label: 'Maqāyīs al-Lugha · Arabic', language: 'ar', senseStyle: 'plain', headReader: 'maqayis', articles: 'essay', sharesPicks: true },
  lane: { label: 'Lane · English', language: 'en', senseStyle: 'lane', headReader: 'lane', indexed: true, marksVerbs: true, articles: 'lines', sharesPicks: true },
  hanswehr: { label: 'Hans Wehr · English', language: 'en', senseStyle: 'hanswehr', headReader: 'hanswehr', indexed: true, marksVerbs: true, articles: 'lines' },
  baranov: { label: 'Baranov · Russian', language: 'en', senseStyle: 'plain', richSenses: true, sharesPicks: true },
  personal: { language: 'en', autoDirection: true, senseStyle: 'plain', richSenses: true },
};

/** The traits of a dictionary; an unknown one (a demo dictionary) gets the plain English defaults. */
export function traitsOf(providerId: string): ProviderTraits {
  return TRAITS[providerId] ?? DEFAULT_TRAITS;
}

/** The ids of every dictionary with declared traits (the conformance test checks each is registered). */
export const TRAIT_PROVIDER_IDS = Object.keys(TRAITS);

/** The language an entry's senses are written in: its own, else its dictionary's. */
export function entryLanguage(entry: { providerId: string; language?: SenseLanguage }): SenseLanguage {
  return entry.language ?? traitsOf(entry.providerId).language;
}

/** Whether the dictionary's lines open with a headword the sub-entry matcher can read. */
export const hasSubEntryHeads = (providerId: string): boolean => !!traitsOf(providerId).headReader;
/** Whether its lines are sub-entries worth indexing. */
export const hasSubEntryIndex = (providerId: string): boolean => !!traitsOf(providerId).indexed;

/** Whether a dictionary is filed by root (its articles are root articles): the popup shows it folded to a
 * row naming the root until the reader opens it. AraMorph's readings are not, and stay open. */
export const foldsBehindRoot = (providerId: string): boolean => !!traitsOf(providerId).articles;

/** The heading of a dictionary's group in the clean popup. */
export function groupHeading(group: { providerId: string; providerName: string }): string {
  return traitsOf(group.providerId).label ?? group.providerName;
}
