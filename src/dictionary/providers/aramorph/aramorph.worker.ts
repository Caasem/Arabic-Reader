/// <reference lib="webworker" />

/**
 * Owns the AraMorph engine off the main thread: building its tables means
 * parsing ~136k dictionary lines. Every request is answered with `{ id, ... }`
 * so the main-thread proxy can match responses to calls; id 0 is the initial
 * load's `ready` (or `error`) message.
 */
import {
  AramorphEngine,
  createDictTable,
  createMorphTableFromText,
  serializeTables,
  deserializeTables,
  type AramorphTables,
  type SerializedAramorphTables,
} from './engine';
import { loadCachedDictFiles, saveDictFiles, clearDictFiles, loadCachedParsedTables, saveParsedTables } from './store';
import { DICT_FILE_NAMES, type DictFileName } from './dictFileNames';
import bundledDictData from 'virtual:dictionary-data';

let engine = new AramorphEngine();

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** FNV-1a hash plus lengths: identifies "this exact dataset" well enough to
 * reuse a cached parse. */
function fingerprintTexts(texts: Record<DictFileName, string>): string {
  return DICT_FILE_NAMES.map((name) => `${name}:${texts[name].length}:${hash(texts[name])}`).join('|');
}
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Installs tables for `texts`, reusing a cached parse when one matches. The
 * cache is only an optimization: failing to read or write it (quota, private
 * mode, a corrupt row) falls back to parsing and never fails the load. */
async function buildTables(texts: Record<DictFileName, string>): Promise<void> {
  const fingerprint = fingerprintTexts(texts);
  const cached = await loadCachedParsedTables(fingerprint).catch(() => null);
  if (cached) {
    try {
      engine.setTables(deserializeTables(cached as SerializedAramorphTables));
      return;
    } catch {
      // corrupt cache row -- reparse below
    }
  }

  const tables: AramorphTables = {
    dictstems: createDictTable(texts.dictstems),
    dictprefs: createDictTable(texts.dictprefixes),
    dictsuffs: createDictTable(texts.dictsuffixes),
    tableab: createMorphTableFromText(texts.tableab),
    tablebc: createMorphTableFromText(texts.tablebc),
    tableac: createMorphTableFromText(texts.tableac),
  };
  engine.setTables(tables);
  await saveParsedTables(fingerprint, serializeTables(tables)).catch(() => {});
}

// A previously uploaded custom dataset wins; otherwise the bundled one,
// embedded in this worker's chunk at build time.
const ready = loadCachedDictFiles()
  .catch(() => null)
  .then((cached) => buildTables(cached ?? bundledDictData));

ready.then(
  () => postMessage({ id: 0, type: 'ready', tableSizes: engine.tableSizes }),
  (err) => postMessage({ id: 0, type: 'error', message: `The dictionary failed to load: ${errorMessage(err)}` })
);

type Incoming =
  | { id: number; type: 'lookup'; word: string }
  | { id: number; type: 'analyzeMany'; words: string[] }
  | { id: number; type: 'importTexts'; texts: Record<DictFileName, string> }
  | { id: number; type: 'resetToBundled' };

self.onmessage = async (e: MessageEvent<Incoming>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'lookup': {
        await ready;
        postMessage({ id: msg.id, type: 'lookupResult', results: engine.lookup(msg.word) });
        break;
      }
      case 'analyzeMany': {
        await ready;
        const resultsByWord: Record<string, ReturnType<AramorphEngine['lookup']>> = {};
        for (const word of msg.words) resultsByWord[word] = engine.lookup(word);
        postMessage({ id: msg.id, type: 'manyResults', resultsByWord });
        break;
      }
      case 'importTexts': {
        await ready.catch(() => {});
        await saveDictFiles(msg.texts);
        await buildTables(msg.texts);
        postMessage({ id: msg.id, type: 'built', tableSizes: engine.tableSizes });
        break;
      }
      case 'resetToBundled': {
        await ready.catch(() => {});
        await clearDictFiles();
        engine = new AramorphEngine();
        await buildTables(bundledDictData);
        postMessage({ id: msg.id, type: 'built', tableSizes: engine.tableSizes });
        break;
      }
    }
  } catch (err) {
    postMessage({ id: msg.id, type: 'error', message: errorMessage(err) });
  }
};
