import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookMeta } from '../../../types';
import { searchBookFile, type SearchOptions, type SearchResult } from '../../../reader/epub/bookSearch';
import { libraryService } from '../../../library/libraryService';
import { readJSON, STORAGE_KEYS, writeJSON } from '../../../utils/storage';

export type SearchScope = 'page' | 'book' | 'library';
export type SearchMode = NonNullable<SearchOptions['mode']>;
/** A result plus the book it came from (Library scope can point elsewhere). */
export type AnySearchResult = SearchResult & { book: BookMeta };

/** Live search waits for typing to pause: every search walks the whole book. */
const LIVE_SEARCH_DELAY_MS = 350;
const HISTORY_LIMIT = 8;

function readHistory(): string[] {
  const stored = readJSON<unknown>(STORAGE_KEYS.searchHistory);
  return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [];
}

/** Library scope: every stored book, one at a time, without rendering any. */
async function searchLibrary(query: string, mode: SearchMode): Promise<AnySearchResult[]> {
  const all: AnySearchResult[] = [];
  for (const book of await libraryService.listBooks()) {
    const file = await libraryService.getBookFile(book.id);
    if (!file) continue;
    try {
      all.push(...(await searchBookFile(file, query, { mode })).map((r) => ({ ...r, book })));
    } catch {
      // an unreadable book contributes no results
    }
  }
  return all;
}

interface Options {
  book: BookMeta;
  open: boolean;
  liveSearchEnabled: boolean;
  historyEnabled: boolean;
  /** Searches the open book; `pageOnly` limits it to the current section. */
  searchOpenBook(query: string, options: { mode: SearchMode; pageOnly: boolean }): Promise<SearchResult[]>;
  goToCfi(cfi: string): void;
  openBookAt?(book: BookMeta, cfi: string): void;
}

export function useBookSearch({ book, open, liveSearchEnabled, historyEnabled, searchOpenBook, goToCfi, openBookAt }: Options) {
  const [query, setQueryState] = useState('');
  const [scope, setScopeState] = useState<SearchScope>('book');
  const [mode, setModeState] = useState<SearchMode>('phrase');
  const [results, setResults] = useState<AnySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState<string[]>(readHistory);
  // Identifies the latest search; results of an older, slower one are dropped.
  const requestRef = useRef(0);

  const invalidate = () => {
    requestRef.current++;
    setResults(null);
    setSearching(false);
  };

  const remember = useCallback(
    (text: string) => {
      if (!historyEnabled || !text) return;
      const next = [text, ...readHistory().filter((item) => item !== text)].slice(0, HISTORY_LIMIT);
      writeJSON(STORAGE_KEYS.searchHistory, next);
      setHistory(next);
    },
    [historyEnabled]
  );

  /** `record`: add to history (explicit searches only, never live keystrokes). */
  const run = useCallback(
    async (text: string, record: boolean) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const request = ++requestRef.current;
      setSearching(true);
      setResults(null);
      setActiveIndex(0);
      try {
        const found =
          scope === 'library'
            ? await searchLibrary(trimmed, mode)
            : (await searchOpenBook(trimmed, { mode, pageOnly: scope === 'page' })).map((r) => ({ ...r, book }));
        if (request !== requestRef.current) return;
        setResults(found);
        if (record && found.length) remember(trimmed);
      } finally {
        if (request === requestRef.current) setSearching(false);
      }
    },
    [scope, mode, searchOpenBook, book, remember]
  );

  // Live search never covers Library scope, which parses every book.
  useEffect(() => {
    if (!open || !liveSearchEnabled || scope === 'library' || !query.trim()) return;
    const timer = window.setTimeout(() => void run(query, false), LIVE_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, liveSearchEnabled, scope, query, run]);

  return {
    query,
    scope,
    mode,
    results,
    searching,
    activeIndex,
    history,
    setQuery(value: string) {
      setQueryState(value);
      if (!value.trim()) invalidate();
    },
    // Results computed under a different scope or mode would be misleading.
    setScope(value: SearchScope) {
      setScopeState(value);
      invalidate();
    },
    setMode(value: SearchMode) {
      setModeState(value);
      invalidate();
    },
    submit() {
      void run(query, true);
    },
    pickHistoryItem(item: string) {
      setQueryState(item);
      if (!liveSearchEnabled || scope === 'library') void run(item, true);
    },
    goToResult(index: number) {
      if (!results?.length) return;
      const wrapped = ((index % results.length) + results.length) % results.length;
      setActiveIndex(wrapped);
      remember(query.trim());
      const result = results[wrapped];
      if (result.book.id === book.id) goToCfi(result.cfi);
      else openBookAt?.(result.book, result.cfi);
    },
  };
}

export type BookSearch = ReturnType<typeof useBookSearch>;
