import type { DictionaryEntry, DictionaryProvider, MorphologicalAnalysis, MorphologyProvider } from '../../../types';
import type { AramorphResult, AramorphTables } from './engine';
import { DICT_FILE_NAMES, readDictFileList, type DictFileName } from './dictFileNames';

type TableSizes = Record<keyof AramorphTables, number>;

type WorkerResponse =
  | { id: number; type: 'ready' | 'built'; tableSizes: TableSizes | null }
  | { id: number; type: 'lookupResult'; results: AramorphResult[] }
  | { id: number; type: 'error'; message: string };

/**
 * The real dictionary: the project's own AraMorph/Buckwalter prefix+stem+
 * suffix engine, ported unchanged from the browser extension. Behaves
 * exactly like the mock providers from the outside (DictionaryProvider /
 * MorphologyProvider) — the reader and DictionaryManager don't know or care
 * that this one needs user-supplied data files before it can answer.
 *
 * The engine itself (parsing ~136k dictionary lines, plus every lookup)
 * runs inside a dedicated Web Worker (aramorph.worker.ts), not here — this
 * class is a thin postMessage proxy that keeps the exact same API so
 * nothing else in the app (DictionaryManager, Settings, the debug hook in
 * main.tsx) needs to know that changed. That move gets a genuinely large
 * dictionary-table build off the main thread, so it no longer competes with
 * rendering the UI at startup or on "Reset to default"/a custom upload.
 */
export class AramorphDictionaryProvider implements DictionaryProvider, MorphologyProvider {
  id = 'aramorph';
  name = 'Arabic Dictionary (AraMorph)';

  private worker = new Worker(new URL('./aramorph.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { resolve: (msg: WorkerResponse) => void; reject: (err: Error) => void }>();
  private ready = false;
  private _tableSizes: TableSizes | null = null;
  private readyPromise: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.readyPromise = new Promise((res) => {
      resolveReady = res;
    });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'ready' || msg.type === 'built') {
        this._tableSizes = msg.tableSizes;
        this.ready = !!msg.tableSizes;
        if (msg.type === 'ready') resolveReady();
      }
      const waiter = this.pending.get(msg.id);
      if (!waiter) return; // the initial 'ready' message (id 0) has no caller waiting on it
      this.pending.delete(msg.id);
      if (msg.type === 'error') waiter.reject(new Error(msg.message));
      else waiter.resolve(msg);
    };
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** See AramorphEngine.tableSizes -- surfaced for the Settings diagnostic button. */
  get tableSizes(): TableSizes | null {
    return this._tableSizes;
  }

  /** Resolves once the worker's initial load (cached custom upload, or the
   * bundled default) has finished. */
  async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  private call(type: string, payload: Record<string, unknown> = {}): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  async importFiles(fileList: FileList | File[]): Promise<void> {
    const texts = await readDictFileList(fileList);
    await this.call('importTexts', { texts });
  }

  /** Same as `importFiles`, but for six separately-picked single-file inputs
   * (one per expected table) instead of one multi-select picker -- some
   * mobile file-manager apps don't support multi-select well, and this skips
   * `readDictFileList`'s by-filename matching entirely since the caller
   * already knows which slot each file belongs to. */
  async importFileMap(files: Partial<Record<DictFileName, File>>): Promise<void> {
    const missing = DICT_FILE_NAMES.filter((name) => !files[name]);
    if (missing.length) {
      throw new Error(`Missing file(s) for: ${missing.join(', ')} — please select all six dictionary data files.`);
    }
    const entries = await Promise.all(DICT_FILE_NAMES.map(async (name) => [name, await files[name]!.text()] as const));
    const texts = Object.fromEntries(entries) as Record<DictFileName, string>;
    await this.call('importTexts', { texts });
  }

  /** Drops any custom upload and reloads the bundled default dataset. */
  async resetToBundled(): Promise<void> {
    await this.call('resetToBundled');
  }

  async clear(): Promise<void> {
    await this.call('clear');
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    await this.readyPromise;
    const msg = await this.call('lookup', { word });
    return msg.type === 'lookupResult' ? this.groupByWord(msg.results) : [];
  }

  async analyze(word: string): Promise<MorphologicalAnalysis[]> {
    await this.readyPromise;
    const msg = await this.call('analyze', { word });
    const results = msg.type === 'lookupResult' ? msg.results : [];
    return results.slice(0, 5).map((r) => ({
      surfaceForm: r.word,
      lemma: r.lemma && r.lemma !== '---' ? r.lemma : r.word,
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
      lemma: entries.find((e) => e.lemma && e.lemma !== '---' && e.lemma !== word)?.lemma,
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
