import type { DictionaryEntry, DictionaryProvider, MorphologicalAnalysis, MorphologyProvider } from '../../../types';
import { AramorphEngine, createDictTable, createMorphTableFromText, type AramorphResult } from './engine';
import { loadCachedDictFiles, readDictFileList, saveDictFiles, clearDictFiles, fetchBundledDictFiles, type DictFileName } from './store';

/**
 * The real dictionary: the project's own AraMorph/Buckwalter prefix+stem+
 * suffix engine, ported unchanged from the browser extension. Behaves
 * exactly like the mock providers from the outside (DictionaryProvider /
 * MorphologyProvider) — the reader and DictionaryManager don't know or
 * care that this one needs user-supplied data files before it can answer.
 */
export class AramorphDictionaryProvider implements DictionaryProvider, MorphologyProvider {
  id = 'aramorph';
  name = 'Arabic Dictionary (AraMorph)';
  private engine = new AramorphEngine();
  private loadingFromCache: Promise<void> | null = null;

  constructor() {
    // Prefer whatever's already cached (a previous upload, or a previously
    // fetched copy of the bundled default). If nothing's cached yet, fall
    // back to the bundled dataset shipped under public/dictionary-data/ and
    // cache it so the next load is a fast IndexedDB read instead of a fetch
    // + re-parse of ~3.6MB of text.
    this.loadingFromCache = loadCachedDictFiles().then(async (texts) => {
      if (texts) {
        this.buildTables(texts);
        return;
      }
      const bundled = await fetchBundledDictFiles();
      if (bundled) {
        this.buildTables(bundled);
        await saveDictFiles(bundled);
      }
    });
  }

  get isReady(): boolean {
    return this.engine.isReady;
  }

  /** Resolves once any previously-cached files have been loaded (or confirmed absent). */
  async whenReady(): Promise<void> {
    await this.loadingFromCache;
  }

  async importFiles(fileList: FileList | File[]): Promise<void> {
    const texts = await readDictFileList(fileList);
    await saveDictFiles(texts);
    this.buildTables(texts);
  }

  /** Drops any custom upload and reloads the bundled default dataset. */
  async resetToBundled(): Promise<void> {
    await clearDictFiles();
    this.engine = new AramorphEngine();
    const bundled = await fetchBundledDictFiles();
    if (bundled) {
      this.buildTables(bundled);
      await saveDictFiles(bundled);
    }
  }

  async clear(): Promise<void> {
    await clearDictFiles();
    this.engine = new AramorphEngine();
  }

  private buildTables(texts: Record<DictFileName, string>): void {
    this.engine.setTables({
      dictstems: createDictTable(texts.dictstems),
      dictprefs: createDictTable(texts.dictprefixes),
      dictsuffs: createDictTable(texts.dictsuffixes),
      tableab: createMorphTableFromText(texts.tableab),
      tablebc: createMorphTableFromText(texts.tablebc),
      tableac: createMorphTableFromText(texts.tableac),
    });
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    await this.loadingFromCache;
    const results = this.engine.lookup(word);
    return this.groupByWord(results);
  }

  async analyze(word: string): Promise<MorphologicalAnalysis[]> {
    await this.loadingFromCache;
    const results = this.engine.lookup(word);
    return results.slice(0, 5).map((r) => ({
      surfaceForm: r.word,
      lemma: r.word,
      root: r.root !== '---' ? r.root : undefined,
      pos: r.pos || undefined,
    }));
  }

  private groupByWord(results: AramorphResult[]): DictionaryEntry[] {
    const byWord = new Map<string, AramorphResult[]>();
    for (const r of results) {
      const list = byWord.get(r.word) ?? [];
      list.push(r);
      byWord.set(r.word, list);
    }
    return Array.from(byWord.entries()).map(([word, entries]) => ({
      providerId: this.id,
      providerName: this.name,
      headword: word,
      root: entries.find((e) => e.root && e.root !== '---')?.root,
      // `e.pos` is the raw AraMorph affix-analysis string (e.g.
      // "+at/PVSUFF_SUBJ:3FS+hu/PVSUFF_DO:3MS" or "Al/DET+") — it records
      // which prefix/suffix morphemes combined to form this word, for
      // grammar-matching purposes internal to the engine. It isn't a
      // conventional part-of-speech label (noun/verb/etc.) like the mock
      // providers' `pos`, and showing it as a tag next to the gloss reads as
      // noise rather than useful information, so it's intentionally left out
      // of what's surfaced here. The grammatical role it encodes is usually
      // already spelled out in plain English inside the gloss itself (e.g.
      // "write [he/it <verb>]").
      senses: entries.map((e) => ({
        gloss: e.def || '(no gloss available)',
      })),
    }));
  }
}

export const aramorphProvider = new AramorphDictionaryProvider();
