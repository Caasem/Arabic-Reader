import type { DictionaryLookupResult, DictionaryProvider, MorphologyProvider } from '../types';

/**
 * Central point of contact for word lookups. The reader/UI only ever calls
 * `dictionaryManager.lookup(word)` — it has no idea how many providers
 * exist, where their data comes from, or which ones are currently switched
 * on. Adding a new dictionary, or swapping the mock morphology provider for
 * a real analyzer, means registering it here; nothing else in the app
 * changes.
 */
export class DictionaryManager {
  private providers: DictionaryProvider[] = [];
  private morphologyProvider: MorphologyProvider | null = null;
  private cache = new Map<string, DictionaryLookupResult>();
  /** undefined = every registered provider is queried (pre-Settings-UI default). */
  private enabledProviderIds: Set<string> | undefined;

  registerProvider(provider: DictionaryProvider): void {
    this.providers.push(provider);
  }

  setMorphologyProvider(provider: MorphologyProvider): void {
    this.morphologyProvider = provider;
  }

  getProviders(): DictionaryProvider[] {
    return this.providers;
  }

  /** Restricts lookups to this set of provider ids — backs the Dictionary switching UI. */
  setEnabledProviders(ids: string[]): void {
    this.enabledProviderIds = new Set(ids);
    this.clearCache();
  }

  isEnabled(providerId: string): boolean {
    return !this.enabledProviderIds || this.enabledProviderIds.has(providerId);
  }

  async lookup(word: string): Promise<DictionaryLookupResult> {
    const cacheKey = this.cacheKey(word);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const activeProviders = this.providers.filter((p) => this.isEnabled(p.id));
    const [entriesPerProvider, morphology] = await Promise.all([
      Promise.all(activeProviders.map((p) => p.lookup(word))),
      this.morphologyProvider ? this.morphologyProvider.analyze(word) : Promise.resolve(undefined),
    ]);

    const result: DictionaryLookupResult = {
      word,
      entries: entriesPerProvider.flat(),
      morphology,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  private cacheKey(word: string): string {
    const ids = this.enabledProviderIds ? Array.from(this.enabledProviderIds).sort().join(',') : 'all';
    return `${ids}::${word}`;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Wire up the default providers: two small mock dictionaries (always
// available, for demoing without any setup) plus the project's real
// AraMorph/Buckwalter engine (ships with a bundled default dataset — see
// AramorphDictionaryProvider — or a user-uploaded one via Settings).
import { MockDictionaryA } from './providers/mockDictionaryA';
import { MockDictionaryB } from './providers/mockDictionaryB';
import { aramorphProvider } from './providers/aramorph/AramorphDictionaryProvider';

export const dictionaryManager = new DictionaryManager();
dictionaryManager.registerProvider(new MockDictionaryA());
dictionaryManager.registerProvider(new MockDictionaryB());
dictionaryManager.registerProvider(aramorphProvider);
// AraMorph already does real prefix/stem/suffix morphological analysis
// (root, lemma, POS) against its full dictionary -- previously the app used
// a separate MockMorphologyProvider here instead, which only matched
// against the tiny demo lexicon the two mock dictionaries share. Since
// AraMorph is enabled and loaded by default, using it for morphology too
// means "Root"/lemma information now works for essentially any real word,
// not just a handful of demo ones.
dictionaryManager.setMorphologyProvider(aramorphProvider);
