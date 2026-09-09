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
import { AramorphEngine, createDictTable, createMorphTableFromText, type AramorphResult } from './engine';
import { loadCachedDictFiles, saveDictFiles, clearDictFiles } from './store';
import type { DictFileName } from './dictFileNames';
import bundledDictData from 'virtual:dictionary-data';

let engine = new AramorphEngine();

function buildTables(texts: Record<DictFileName, string>): void {
  engine.setTables({
    dictstems: createDictTable(texts.dictstems),
    dictprefs: createDictTable(texts.dictprefixes),
    dictsuffs: createDictTable(texts.dictsuffixes),
    tableab: createMorphTableFromText(texts.tableab),
    tablebc: createMorphTableFromText(texts.tablebc),
    tableac: createMorphTableFromText(texts.tableac),
  });
}

// Prefer a previously-uploaded custom dataset if one's cached; otherwise the
// bundled default, embedded directly in this worker's own chunk at build
// time (see vite.config.ts's bundledDictDataPlugin) -- no network fetch
// involved either way.
const ready = loadCachedDictFiles().then((cached) => {
  buildTables(cached ?? bundledDictData);
});

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
        buildTables(msg.texts);
        postMessage({ id: msg.id, type: 'built', tableSizes: engine.tableSizes });
        break;
      }
      case 'resetToBundled': {
        await ready;
        await clearDictFiles();
        engine = new AramorphEngine();
        buildTables(bundledDictData);
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
