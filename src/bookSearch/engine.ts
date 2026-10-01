import ePub, { type Book } from 'epubjs';
import { normalize, normalizeForSearch, tokenize } from '../reader/tokenizer/arabicTokenizer';
import { findTocLabel, forEachSpineSection, mapNavItems, sectionBody } from '../reader/epub/epubInternals';
import { searchBook, type SearchResult } from '../reader/epub/bookSearch';
import { getBookVocabIndex } from '../vocabRarity/bookVocabIndex';
import { aramorphProvider } from '../dictionary/providers/aramorph/AramorphDictionaryProvider';
import type { TocItem } from '../types';

/** One match, already split so the UI can highlight it. */
export interface BookHit {
  cfi: string;
  href: string;
  label?: string;
  before: string;
  match: string;
  after: string;
}

export type BookSearchMode = 'text' | 'root';

export interface OpenedBook {
  book: Book;
  toc: TocItem[];
}

export const MAX_HITS = 200;
const CONTEXT = 70;

export async function openBook(file: Blob): Promise<OpenedBook> {
  const book = ePub(await file.arrayBuffer());
  await book.ready;
  const nav = await book.loaded.navigation;
  return { book, toc: mapNavItems(nav.toc) };
}

function clip(text: string, start: number, end: number): Pick<BookHit, 'before' | 'match' | 'after'> {
  const from = Math.max(0, start - CONTEXT);
  const to = Math.min(text.length, end + CONTEXT);
  return {
    before: (from > 0 ? '…' : '') + text.slice(from, start),
    match: text.slice(start, end),
    after: text.slice(end, to) + (to < text.length ? '…' : ''),
  };
}

/** Finds the (diacritic-insensitive) query inside an already-short excerpt. */
function splitExcerpt(excerpt: string, query: string): Pick<BookHit, 'before' | 'match' | 'after'> {
  const { normalized: nq } = normalizeForSearch(query.trim());
  const { normalized, toOriginal } = normalizeForSearch(excerpt);
  const idx = nq ? normalized.indexOf(nq) : -1;
  if (idx === -1) return { before: excerpt, match: '', after: '' };
  const start = toOriginal[idx];
  const endNorm = idx + nq.length;
  const end = endNorm < toOriginal.length ? toOriginal[endNorm] : excerpt.length;
  return { before: excerpt.slice(0, start), match: excerpt.slice(start, end), after: excerpt.slice(end) };
}

function fromResult(r: SearchResult, query: string): BookHit {
  return { cfi: r.cfi, href: r.href, label: r.label, ...splitExcerpt(r.excerpt, query) };
}

/** Plain text search: the same diacritic-blind matching as the in-reader search. */
export async function searchText(opened: OpenedBook, query: string): Promise<BookHit[]> {
  const found = await searchBook(opened.book, query, { mode: 'phrase' }, (href) => findTocLabel(opened.toc, href));
  return found.slice(0, MAX_HITS).map((r) => fromResult(r, query));
}

/** Per-book cache: normalized surface form -> its roots. */
const rootsCache = new Map<string, Promise<Map<string, Set<string>>>>();

async function rootsOfBookWords(bookId: string, book: Book): Promise<Map<string, Set<string>>> {
  let cached = rootsCache.get(bookId);
  if (!cached) {
    cached = (async () => {
      const index = await getBookVocabIndex(bookId, book);
      const words = Array.from(new Set(index.map((w) => normalize(w.word))));
      const analyses = await aramorphProvider.analyzeMany(words);
      const map = new Map<string, Set<string>>();
      for (const w of words) {
        const roots = new Set<string>();
        for (const a of analyses.get(w) ?? []) if (a.root) roots.add(a.root);
        if (roots.size) map.set(w, roots);
      }
      return map;
    })();
    rootsCache.set(bookId, cached);
    cached.catch(() => rootsCache.delete(bookId));
  }
  return cached;
}

export interface RootSearchResult {
  hits: BookHit[];
  /** The roots found for the typed word, for display. */
  roots: string[];
}

/** Every word in the book that shares a dictionary root with the typed word. */
export async function searchRoot(opened: OpenedBook, bookId: string, query: string): Promise<RootSearchResult> {
  const firstWord = tokenize(query).find((t) => t.isArabic)?.text;
  if (!firstWord) return { hits: [], roots: [] };
  const queryAnalyses = await aramorphProvider.analyze(normalize(firstWord));
  const roots = new Set(queryAnalyses.map((a) => a.root).filter((r): r is string => !!r));
  if (!roots.size) return { hits: [], roots: [] };

  const rootsOf = await rootsOfBookWords(bookId, opened.book);
  const matching = new Set<string>();
  for (const [word, wordRoots] of rootsOf) {
    for (const r of wordRoots) if (roots.has(r)) matching.add(word);
  }
  // The typed word itself, in case the book never uses that exact form.
  matching.add(normalize(firstWord));

  const hits: BookHit[] = [];
  await forEachSpineSection(opened.book, (section, doc) => {
    if (hits.length >= MAX_HITS) return;
    const body = sectionBody(doc);
    if (!body) return;
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && hits.length < MAX_HITS) {
      const text = node.textContent ?? '';
      if (!text.trim()) continue;
      for (const token of tokenize(text)) {
        if (!token.isArabic || !matching.has(normalize(token.text))) continue;
        const range = doc.createRange();
        range.setStart(node, token.start);
        range.setEnd(node, token.end);
        hits.push({
          cfi: section.cfiFromRange(range),
          href: section.href,
          label: findTocLabel(opened.toc, section.href),
          ...clip(text, token.start, token.end),
        });
        if (hits.length >= MAX_HITS) break;
      }
    }
  });
  return { hits, roots: Array.from(roots) };
}
