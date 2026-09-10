/// <reference lib="webworker" />

/**
 * Owns the AraMorph engine entirely off the main thread. Building the
 * lookup tables means parsing ~136k dictstems lines (plus prefixes,
 * suffixes, and three grammar tables) into in-memory Maps -- real CPU work
 * that used to run synchronously on the main thread at app startup and on
 * every "Reset to default"/custom upload, competing with rendering the UI.
 * Every message this worker receives is answered with `{ id, ... }` so the
 * main-thread proxy (AramorphDictionaryProvider) can match responses back
 * to the call that asked for them.
 */
import {
  AramorphEngine,
  createDictTable,
  createMorphTableFromText,
  serializeTables,
  deserializeTables,
  type AramorphResult,
  type AramorphTables,
  type SerializedAramorphTables,
} from './engine';
import { loadCachedDictFiles, saveDictFiles, clearDictFiles, loadCachedParsedTables, saveParsedTables } from './store';
import { DICT_FILE_NAMES, type DictFileName } from './dictFileNames';
import bundledDictData from 'virtual:dictionary-data';

let engine = new AramorphEngine();

// Cheap FNV-1a-style hash over each of the six source texts, combined with
// their lengths -- identifies "this exact dataset" well enough to safely
// reuse a cached parse, without needing a real crypto hash for six files
// that only ever change via a code change (a custom upload) or an app
// update (the bundled default). Run once per buildTables() call, not per
// lookup, so its own cost is irrelevant next to the parse it's replacing.
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

/** Builds (or reuses a cached parse of) the lookup tables for `texts` and
 * installs them on `engine`. The bundled default dataset used to be
 * reparsed from scratch on *every* app launch -- the raw-text cache in
 * store.ts only ever held a custom upload, never the bundled data, and
 * even for a custom upload only the text was cached, not the parsed
 * result. This checks a parsed-table cache first (keyed by a fingerprint
 * of the exact source text, so a different dataset is correctly treated
 * as a miss) and only falls through to the real `createDictTable` parse
 * pass when nothing matches, caching the result afterward either way. */
async function buildTables(texts: Record<DictFileName, string>): Promise<void> {
  const fingerprint = fingerprintTexts(texts);
  const cached = await loadCachedParsedTables(fingerprint);
  if (cached) {
    engine.setTables(deserializeTables(cached as SerializedAramorphTables));
    return;
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
  await saveParsedTables(fingerprint, serializeTables(tables));
}

// Prefer a previously-uploaded custom dataset if one's cached; otherwise the
// bundled default, embedded directly in this worker's own chunk at build
// time (see vite.config.ts's bundledDictDataPlugin) -- no network fetch
// involved either way.
const ready = loadCachedDictFiles().then((cached) => buildTables(cached ?? bundledDictData));

ready.then(() => {
  postMessage({ id: 0, type: 'ready', tableSizes: engine.tableSizes });
});

type Incoming =
  | { id: number; type: 'lookup' | 'analyze'; word: string }
  | { id: number; type: 'analyzeMany'; words: string[] }
  | { id: number; type: 'importTexts'; texts: Record<DictFileName, string> }
  | { id: number; type: 'resetToBundled' }
  | { id: number; type: 'clear' };

self.onmessage = async (e: MessageEvent<Incoming>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'lookup':
      case 'analyze': {
        await ready;
        const results: AramorphResult[] = engine.lookup(msg.word);
        postMessage({ id: msg.id, type: 'lookupResult', results });
        break;
      }
      case 'analyzeMany': {
        // One round-trip for many words instead of one per word -- used by
        // the book-vocabulary indexer (see bookVocabIndex.ts), which needs
        // morphology for every distinct word in a book (easily thousands)
        // to grade morphological complexity alongside frequency rank. All
        // in-memory Map lookups, so looping here is cheap; postMessage
        // overhead per word is what this avoids.
        await ready;
        const resultsByWord: Record<string, AramorphResult[]> = {};
        for (const word of msg.words) resultsByWord[word] = engine.lookup(word);
        postMessage({ id: msg.id, type: 'manyResults', resultsByWord });
        break;
      }
      case 'importTexts': {
        await ready;
        await saveDictFiles(msg.texts);
        await buildTables(msg.texts);
        postMessage({ id: msg.id, type: 'built', tableSizes: engine.tableSizes });
        break;
      }
      case 'resetToBundled': {
        await ready;
        await clearDictFiles();
        engine = new AramorphEngine();
        await buildTables(bundledDictData);
        postMessage({ id: msg.id, type: 'built', tableSizes: engine.tableSizes });
        break;
      }
      case 'clear': {
        await ready;
        await clearDictFiles();
        engine = new AramorphEngine();
        postMessage({ id: msg.id, type: 'built', tableSizes: null });
        break;
      }
    }
  } catch (err) {
    postMessage({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
