import type { DictionaryLookupResult, DictionaryProvider, MorphologyProvider } from '../types';
import { aramorphProvider } from './providers/aramorph/AramorphDictionaryProvider';
import { alWasitProvider } from './providers/alwasit/AlWasitDictionaryProvider';

const CACHE_LIMIT = 300;

/**
 * The single entry point for word lookups. Callers never know how many
 * providers exist or which are enabled; adding a dictionary means registering
 * it here.
 */
export class DictionaryManager {
  private providers: DictionaryProvider[] = [];
  private morphologyProvider: MorphologyProvider | null = null;
  /** Insertion-ordered, so the oldest entry is evicted first (LRU). */
  private cache = new Map<string, DictionaryLookupResult>();
  /** undefined = every registered provider is queried. */
  private enabledProviderIds: Set<string> | undefined;

  registerProvider(provider: DictionaryProvider): void {
    this.providers.push(provider);
    provider.onDataChanged?.(() => this.clearCache());
  }

  setMorphologyProvider(provider: MorphologyProvider): void {
    this.morphologyProvider = provider;
  }

  getProviders(): DictionaryProvider[] {
    return this.providers;
  }

  setEnabledProviders(ids: string[]): void {
    this.enabledProviderIds = new Set(ids);
    this.clearCache();
  }

  isEnabled(providerId: string): boolean {
    return !this.enabledProviderIds || this.enabledProviderIds.has(providerId);
  }

  /**
   * Queries every enabled provider in parallel. One provider failing (e.g. an
   * optional dataset that can't load offline) never hides the others'
   * entries: it's listed in `failedProviders`, and the result isn't cached so
   * a later lookup can retry.
   */
  async lookup(word: string): Promise<DictionaryLookupResult> {
    const key = this.cacheKey(word);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const active = this.providers.filter((p) => this.isEnabled(p.id));
    const [outcomes, morphology] = await Promise.all([
      Promise.allSettled(active.map((p) => p.lookup(word))),
      this.morphologyProvider ? this.morphologyProvider.analyze(word).catch(() => undefined) : Promise.resolve(undefined),
    ]);

    const entries: DictionaryLookupResult['entries'] = [];
    const failedProviders: { id: string; name: string }[] = [];
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') entries.push(...outcome.value);
      else failedProviders.push({ id: active[i].id, name: active[i].name });
    });

    const result: DictionaryLookupResult = { word, entries, morphology };
    if (failedProviders.length) {
      result.failedProviders = failedProviders;
    } else {
      this.cache.set(key, result);
      if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    }
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

export const dictionaryManager = new DictionaryManager();
dictionaryManager.registerProvider(aramorphProvider);
// Off by default (not in DEFAULT_PREFS.enabledProviderIds); registering it is
// what makes it appear as a toggle in Settings.
dictionaryManager.registerProvider(alWasitProvider);
// AraMorph's prefix/stem/suffix analysis also supplies root, lemma and POS.
dictionaryManager.setMorphologyProvider(aramorphProvider);

// Two tiny demo dictionaries, for development only.
if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
  void Promise.all([import('./providers/mockDictionaryA'), import('./providers/mockDictionaryB')]).then(([a, b]) => {
    dictionaryManager.registerProvider(new a.MockDictionaryA());
    dictionaryManager.registerProvider(new b.MockDictionaryB());
  });
}
