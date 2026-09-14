import type { DictionaryEntry, DictionaryProvider, MorphologicalAnalysis, MorphologyProvider } from '../../../types';
import type { AramorphResult, AramorphTables } from './engine';
import { DICT_FILE_NAMES, readDictFileList, type DictFileName } from './dictFileNames';

type TableSizes = Record<keyof AramorphTables, number>;

type WorkerResponse =
  | { id: number; type: 'ready' | 'built'; tableSizes: TableSizes | null }
  | { id: number; type: 'lookupResult'; results: AramorphResult[] }
  | { id: number; type: 'manyResults'; resultsByWord: Record<string, AramorphResult[]> }
  | { id: number; type: 'error'; message: string };

export type AramorphStatus = 'loading' | 'ready' | 'failed';

/** Results for recently looked-up words, shared by lookup() and analyze()
 * (and Al-Wasit's own analyze() call) so one tap costs one worker round-trip. */
const RESULT_CACHE_LIMIT = 200;

/**
 * The bundled AraMorph/Buckwalter dictionary. The engine runs in a Web Worker
 * (aramorph.worker.ts) so building its tables never blocks the UI; this class
 * is the main-thread proxy.
 */
export class AramorphDictionaryProvider implements DictionaryProvider, MorphologyProvider {
  id = 'aramorph';
  name = 'Arabic Dictionary (AraMorph)';

  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (msg: WorkerResponse) => void; reject: (err: Error) => void }>();
  private _status: AramorphStatus = 'loading';
  private _loadError: string | null = null;
  private _tableSizes: TableSizes | null = null;
  private crashed = false;
  private readonly readyPromise: Promise<void>;
  private readonly results = new Map<string, Promise<AramorphResult[]>>();
  private readonly dataListeners = new Set<() => void>();

  constructor() {
    let resolveReady!: () => void;
    let rejectReady!: (err: Error) => void;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Failures surface through `status` and per-call rejections.
    this.readyPromise.catch(() => {});

    this.worker = new Worker(new URL('./aramorph.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'ready' || msg.type === 'built') {
        this._tableSizes = msg.tableSizes;
        this._status = msg.tableSizes ? 'ready' : 'failed';
        if (msg.type === 'ready') resolveReady();
      }
      if (msg.id === 0) {
        if (msg.type === 'error') {
          this._status = 'failed';
          this._loadError = msg.message;
          rejectReady(new Error(msg.message));
        }
        return;
      }
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.type === 'error') waiter.reject(new Error(msg.message));
      else waiter.resolve(msg);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      const message = e.message || 'The dictionary worker stopped unexpectedly.';
      this.crashed = true;
      this._status = 'failed';
      this._loadError = message;
      rejectReady(new Error(message));
      for (const waiter of this.pending.values()) waiter.reject(new Error(message));
      this.pending.clear();
      this.results.clear();
    };
  }

  get status(): AramorphStatus {
    return this._status;
  }

  get isReady(): boolean {
    return this._status === 'ready';
  }

  get loadError(): string | null {
    return this._loadError;
  }

  /** Per-table entry counts, for the Settings diagnostics. */
  get tableSizes(): TableSizes | null {
    return this._tableSizes;
  }

  /** Resolves once the initial load has finished, successfully or not. */
  async whenReady(): Promise<void> {
    await this.readyPromise.catch(() => {});
  }

  onDataChanged(listener: () => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private dataChanged(): void {
    this.results.clear();
    this.dataListeners.forEach((l) => l());
  }

  private call(type: string, payload: Record<string, unknown> = {}): Promise<WorkerResponse> {
    if (this.crashed) return Promise.reject(new Error(this._loadError ?? 'The dictionary is unavailable.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  async importFiles(fileList: FileList | File[]): Promise<void> {
    const texts = await readDictFileList(fileList);
    await this.call('importTexts', { texts });
    this.dataChanged();
  }

  /** Like importFiles, for six separately picked files (some mobile file
   * pickers don't do multi-select well). */
  async importFileMap(files: Partial<Record<DictFileName, File>>): Promise<void> {
    const missing = DICT_FILE_NAMES.filter((name) => !files[name]);
    if (missing.length) {
      throw new Error(`Missing file(s) for: ${missing.join(', ')} — please select all six dictionary data files.`);
    }
    const entries = await Promise.all(DICT_FILE_NAMES.map(async (name) => [name, await files[name]!.text()] as const));
    await this.call('importTexts', { texts: Object.fromEntries(entries) });
    this.dataChanged();
  }

  /** Drops any custom upload and reloads the bundled dataset. */
  async resetToBundled(): Promise<void> {
    await this.call('resetToBundled');
    this.dataChanged();
  }

  private rawLookup(word: string): Promise<AramorphResult[]> {
    const cached = this.results.get(word);
    if (cached) {
      this.results.delete(word);
      this.results.set(word, cached);
      return cached;
    }
    const pending = this.readyPromise
      .then(() => this.call('lookup', { word }))
      .then((msg) => (msg.type === 'lookupResult' ? msg.results : []));
    pending.catch(() => this.results.delete(word));
    this.results.set(word, pending);
    if (this.results.size > RESULT_CACHE_LIMIT) this.results.delete(this.results.keys().next().value!);
    return pending;
  }

  async lookup(word: string): Promise<DictionaryEntry[]> {
    return this.groupByWord(await this.rawLookup(word));
  }

  async analyze(word: string): Promise<MorphologicalAnalysis[]> {
    return toAnalyses(await this.rawLookup(word));
  }

  /** analyze() for many words in one worker round-trip (book vocabulary index). */
  async analyzeMany(words: string[]): Promise<Map<string, MorphologicalAnalysis[]>> {
    await this.readyPromise;
    const msg = await this.call('analyzeMany', { words });
    const out = new Map<string, MorphologicalAnalysis[]>();
    if (msg.type !== 'manyResults') return out;
    for (const word of words) out.set(word, toAnalyses(msg.resultsByWord[word] ?? []));
    return out;
  }

  private groupByWord(results: AramorphResult[]): DictionaryEntry[] {
    const byWord = new Map<string, AramorphResult[]>();
    for (const r of results) {
      const list = byWord.get(r.word);
      if (list) list.push(r);
      else byWord.set(r.word, [r]);
    }
    return Array.from(byWord.entries()).map(([word, entries]) => ({
      providerId: this.id,
      providerName: this.name,
      headword: word,
      root: entries.find((e) => e.root && e.root !== '---')?.root,
      lemma: entries.find((e) => e.lemma && e.lemma !== '---' && e.lemma !== word)?.lemma,
      // `pos` here is AraMorph's raw affix analysis ("+at/PVSUFF_SUBJ:3FS"),
      // not a readable part of speech, so it's not shown; the gloss already
      // spells out the grammatical role in English.
      senses: entries.map((e) => ({ gloss: e.def || '(no gloss available)' })),
    }));
  }
}

function toAnalyses(results: AramorphResult[]): MorphologicalAnalysis[] {
  return results.slice(0, 5).map((r) => ({
    surfaceForm: r.word,
    lemma: r.lemma && r.lemma !== '---' ? r.lemma : r.word,
    root: r.root !== '---' ? r.root : undefined,
    pos: r.pos || undefined,
  }));
}

export const aramorphProvider = new AramorphDictionaryProvider();
