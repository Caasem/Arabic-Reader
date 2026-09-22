import ePub, { type Book } from 'epubjs';
import { normalizeForSearch } from '../tokenizer/arabicTokenizer';
import { findTocLabel, forEachSpineSection, mapNavItems, sectionBody } from './epubInternals';

/**
 * Match-quality tier, in presentation order: a literal match, one that only
 * lines up once diacritics/hamza variants are normalized, then a looser
 * word-mode match (all query words present, not necessarily adjacent).
 */
export type SearchMatchType = 'exact' | 'normalized' | 'partial';

export interface SearchResult {
  cfi: string;
  excerpt: string;
  href: string;
  label?: string;
  matchType: SearchMatchType;
}

export interface SearchOptions {
  /** 'phrase' (default): the query must appear as one substring. 'word':
   * every query word must appear in the same text node, in any order. */
  mode?: 'phrase' | 'word';
  /** Restrict the search to one section href (the "This page" scope). */
  sectionHref?: string;
  signal?: AbortSignal;
}

const EXCERPT_LIMIT = 150;
const TIER_ORDER: Record<SearchMatchType, number> = { exact: 0, normalized: 1, partial: 2 };

function excerptOf(text: string, start: number, end: number): string {
  if (text.length <= EXCERPT_LIMIT) return text;
  const from = Math.max(0, start - EXCERPT_LIMIT / 2);
  const to = Math.min(text.length, end + EXCERPT_LIMIT / 2);
  return '...' + text.slice(from, to) + '...';
}

/**
 * Diacritic-insensitive, alef-variant-folding text search over a book's
 * spine. Needs only a parsed epub.js `Book` -- nothing is rendered, so a
 * library-wide search never executes any book's content. Matches are found
 * in the normalized text, then mapped back to offsets in the original text
 * so CFIs and excerpts refer to the real, un-normalized content.
 */
export async function searchBook(
  book: Book,
  query: string,
  options: SearchOptions = {},
  labelFor: (href: string) => string | undefined = () => undefined
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  const { normalized: normalizedQuery } = normalizeForSearch(trimmed);
  if (!normalizedQuery) return [];
  const mode = options.mode ?? 'phrase';
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  const results: SearchResult[] = [];

  await forEachSpineSection(
    book,
    (section, doc) => {
      const body = sectionBody(doc);
      if (!body) return;
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const push = (node: Node, text: string, start: number, end: number, matchType: SearchMatchType) => {
        const range = doc.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        results.push({
          cfi: section.cfiFromRange(range),
          excerpt: excerptOf(text, start, end),
          href: section.href,
          label: labelFor(section.href),
          matchType,
        });
      };

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        if (!text.trim()) continue;
        const { normalized, toOriginal } = normalizeForSearch(text);
        const originalEnd = (normalizedEnd: number) =>
          normalizedEnd < toOriginal.length ? toOriginal[normalizedEnd] : text.length;

        if (mode === 'word') {
          const firstIdx = normalized.indexOf(queryWords[0]);
          if (firstIdx === -1 || !queryWords.every((w) => normalized.includes(w))) continue;
          push(node, text, toOriginal[firstIdx], originalEnd(firstIdx + queryWords[0].length), 'partial');
          continue;
        }

        for (let from = 0; ; ) {
          const idx = normalized.indexOf(normalizedQuery, from);
          if (idx === -1) break;
          from = idx + normalizedQuery.length;
          const start = toOriginal[idx];
          const end = originalEnd(from);
          push(node, text, start, end, text.slice(start, end) === trimmed ? 'exact' : 'normalized');
        }
      }
    },
    {
      filter: options.sectionHref ? (s) => s.href === options.sectionHref : undefined,
      signal: options.signal,
    }
  );

  // Array.prototype.sort is stable, so reading order is kept within a tier.
  return results.sort((a, b) => TIER_ORDER[a.matchType] - TIER_ORDER[b.matchType]);
}

/** Searches a stored book file without rendering it (Library search scope). */
export async function searchBookFile(file: Blob, query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const book = ePub(await file.arrayBuffer());
  try {
    await book.ready;
    const nav = await book.loaded.navigation;
    const toc = mapNavItems(nav.toc);
    return await searchBook(book, query, options, (href) => findTocLabel(toc, href));
  } finally {
    book.destroy();
  }
}
