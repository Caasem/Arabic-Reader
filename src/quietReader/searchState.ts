import { useCallback, useEffect, useRef, useState } from 'react';
import { dictionaryManager } from '../dictionary';
import { libraryService } from '../library/libraryService';
import { parseCleanEpub } from '../cleanReader/parseCleanEpub';
import { readJSON, STORAGE_KEYS, writeJSON } from '../utils/storage';
import type { BookMeta } from '../types';
import { buildBookModel, type BookModel } from './bookModel';
import { searchTexts, type CleanHit, type CleanMatch } from './cleanSearch';
import { searchSameRoot } from './rootSearch';
import { senseText } from '../dictionary/senseText';

export type SearchScope = 'page' | 'book' | 'library' | 'dict';

export interface SearchHit extends CleanHit {
  book: BookMeta;
  /** Chapter title, with the book's title in Library scope. */
  where: string;
  /** Dictionary scope: the entry's gloss. */
  gloss?: string;
  /** Dictionary scope: the word to look up. */
  lookUp?: string;
}

export interface SearchRequest {
  query?: string;
  scope?: SearchScope;
  match?: CleanMatch;
  /** Bumped per request so the same request can be made twice. */
  nonce: number;
}

const LIVE_DELAY_MS = 350;
const HISTORY_LIMIT = 8;

function readHistory(): string[] {
  const stored = readJSON<unknown>(STORAGE_KEYS.searchHistory);
  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : [];
}

/** Other books' clean text, parsed once per session for Library search. */
const libraryModels = new Map<string, Promise<BookModel | null>>();
function modelFor(book: BookMeta): Promise<BookModel | null> {
  let cached = libraryModels.get(book.id);
  if (!cached) {
    cached = libraryService
      .getBookFile(book.id)
      .then((file) => (file ? parseCleanEpub(file).then(buildBookModel) : null))
      .catch(() => null);
    libraryModels.set(book.id, cached);
  }
  return cached;
}

/** The drawer's Search tab: query, where to look, how to match, and the results. */
export function useReaderSearch({
  book,
  model,
  chapter,
  liveSearch,
  history: historyEnabled,
}: {
  book: BookMeta;
  model: BookModel | null;
  chapter: number;
  liveSearch: boolean;
  history: boolean;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('book');
  const [match, setMatch] = useState<CleanMatch>('phrase');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<string[]>(readHistory);
  const request = useRef(0);

  const remember = useCallback(
    (text: string) => {
      if (!historyEnabled || !text) return;
      const next = [text, ...readHistory().filter((h) => h !== text)].slice(0, HISTORY_LIMIT);
      writeJSON(STORAGE_KEYS.searchHistory, next);
      setHistory(next);
    },
    [historyEnabled]
  );

  const run = useCallback(
    async (text: string, record: boolean) => {
      const trimmed = text.trim();
      if (!trimmed || !model) return;
      const id = ++request.current;
      setSearching(true);
      try {
        let found: SearchHit[] = [];
        let foundRoots: string[] = [];
        const titled = (hit: CleanHit, m: BookModel, b: BookMeta, prefix = ''): SearchHit => ({
          ...hit,
          book: b,
          where: prefix + (m.book.chapters[hit.chapter]?.title ?? ''),
        });
        if (scope === 'dict') {
          const result = await dictionaryManager.lookup(trimmed);
          found = result.entries.map((e) => ({
            chapter: -1,
            start: 0,
            end: 0,
            before: '',
            match: e.headword,
            after: '',
            book,
            where: `Dictionary · ${e.providerName}`,
            gloss: e.senses.map(senseText).join('; '),
            lookUp: e.headword,
          }));
        } else if (scope === 'library') {
          for (const other of await libraryService.listBooks()) {
            const m = other.id === book.id ? model : await modelFor(other);
            if (!m) continue;
            const mode = match === 'root' ? 'phrase' : match;
            found.push(...searchTexts(m.texts, trimmed, mode, { paragraphs: m.paragraphs }).map((h) => titled(h, m, other, `${other.title} · `)));
          }
        } else {
          const chapters = scope === 'page' ? [chapter] : undefined;
          if (match === 'root') {
            const r = await searchSameRoot(book.id, model, trimmed, chapters);
            found = r.hits.map((h) => titled(h, model, book));
            foundRoots = r.roots;
          } else {
            found = searchTexts(model.texts, trimmed, match, { chapters, paragraphs: model.paragraphs }).map((h) => titled(h, model, book));
          }
        }
        if (id !== request.current) return;
        setHits(found);
        setRoots(foundRoots);
        setActive(0);
        if (record && found.length) remember(trimmed);
      } catch {
        if (id === request.current) setHits([]);
      } finally {
        if (id === request.current) setSearching(false);
      }
    },
    [scope, match, model, book, chapter, remember]
  );

  // Live search waits for typing to pause, and never covers Library scope (it parses every book).
  useEffect(() => {
    if (!liveSearch || scope === 'library' || !query.trim()) return;
    const timer = window.setTimeout(() => void run(query, false), LIVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [liveSearch, scope, query, run]);

  return {
    query,
    scope,
    match,
    hits: query.trim() ? hits : null,
    roots,
    searching,
    active,
    history,
    needsSubmit: !liveSearch || scope === 'library',
    setQuery(value: string) {
      setQuery(value);
      if (!value.trim()) {
        request.current++;
        setHits(null);
      }
    },
    setScope(value: SearchScope) {
      setScope(value);
      setHits(null);
    },
    setMatch(value: CleanMatch) {
      setMatch(value);
      setHits(null);
    },
    submit() {
      void run(query, true);
    },
    apply(req: SearchRequest) {
      if (req.query !== undefined) setQuery(req.query);
      if (req.scope) setScope(req.scope);
      if (req.match) setMatch(req.match);
      setHits(null);
    },
    pickHistory(item: string) {
      setQuery(item);
      if (!liveSearch || scope === 'library') void run(item, true);
    },
    /** Moves to result `index` (wrapping) and returns it. */
    select(index: number): SearchHit | null {
      if (!hits?.length) return null;
      const wrapped = ((index % hits.length) + hits.length) % hits.length;
      setActive(wrapped);
      remember(query.trim());
      return hits[wrapped];
    },
  };
}

export type ReaderSearch = ReturnType<typeof useReaderSearch>;
