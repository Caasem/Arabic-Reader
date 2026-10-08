/**
 * The Browse library catalogue: the index.tsv of a public book collection, parsed on the device and
 * searched locally. Rows keep only what the screen and the download need.
 */

export interface BrowseSource {
  id: string;
  label: string;
  /** Hugging Face dataset holding index.tsv and the txt/ folders. */
  dataset: string;
}

export const BROWSE_SOURCES: BrowseSource[] = [
  { id: 'waqfeya', label: 'Waqfeya', dataset: 'ieasybooks-org/waqfeya-library' },
  { id: 'shamela-waqfeya', label: 'Shamela Waqfeya', dataset: 'ieasybooks-org/shamela-waqfeya-library' },
];

export interface BrowseBook {
  /** Stable across sessions: source id plus the first text path. */
  key: string;
  sourceId: string;
  category: string;
  author: string;
  title: string;
  pages: number;
  volumes: number;
  /** One per volume, relative to the dataset root (no leading `./`). */
  txtPaths: string[];
  /** The scanned original, one per volume; empty when the collection has none for this book. */
  pdfPaths: string[];
  /** Title, author and category folded for matching. */
  haystack: string;
}

const TASHKEEL_AND_TATWEEL = /[ً-ٰـ]/g;

/** Lower-case, no vowel marks or tatweel, alef forms and ya/ta-marbuta endings merged, so typed queries match loosely. */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(TASHKEEL_AND_TATWEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `"['./txt/a/b.txt', './txt/c/d.txt']"` (a Python list literal) to plain paths. */
export function parsePathList(cell: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  for (let m = re.exec(cell); m; m = re.exec(cell)) out.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1').replace(/^\.\//, ''));
  return out;
}

/** Parses an index.tsv (header row, tab-separated). Rows without a text file are dropped. */
export function parseIndex(tsv: string, sourceId: string): BrowseBook[] {
  const books: BrowseBook[] = [];
  const lines = tsv.split('\n');
  const header = (lines[0] ?? '').replace(/^﻿/, '').replace(/\r$/, '').split('\t');
  const col = (name: string) => header.indexOf(name);
  const [iCat, iAuthor, iTitle, iPages, iVols, iTxt, iPdf] = ['category', 'author', 'title', 'pages', 'volumes', 'txt_paths', 'pdf_paths'].map(col);
  if ([iCat, iAuthor, iTitle, iTxt].some((i) => i < 0)) throw new Error('The catalogue is not in the expected format.');
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].replace(/\r$/, '').split('\t');
    const txtPaths = parsePathList(cells[iTxt] ?? '');
    if (!txtPaths.length) continue;
    const category = cells[iCat] ?? '';
    const author = cells[iAuthor] ?? '';
    const title = cells[iTitle] ?? '';
    books.push({
      key: `${sourceId}:${txtPaths[0]}`,
      sourceId,
      category,
      author,
      title,
      pages: Number(cells[iPages]) || 0,
      volumes: Number(cells[iVols]) || txtPaths.length,
      txtPaths,
      pdfPaths: iPdf >= 0 ? parsePathList(cells[iPdf] ?? '') : [],
      haystack: foldForSearch(`${title} ${author} ${category}`),
    });
  }
  return books;
}

/** Books whose title, author or category contain every word of the query, title matches first. */
export function searchCatalog(books: BrowseBook[], query: string, category: string | null, limit: number): { shown: BrowseBook[]; total: number } {
  const words = foldForSearch(query).split(' ').filter(Boolean);
  const hits: { book: BrowseBook; rank: number }[] = [];
  for (const book of books) {
    if (category && book.category !== category) continue;
    if (!words.every((w) => book.haystack.includes(w))) continue;
    const title = foldForSearch(book.title);
    hits.push({ book, rank: words.every((w) => title.includes(w)) ? 0 : 1 });
  }
  if (words.length) hits.sort((a, b) => a.rank - b.rank);
  return { shown: hits.slice(0, limit).map((h) => h.book), total: hits.length };
}

export function categoriesOf(books: BrowseBook[]): string[] {
  return [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
}

const CACHE_NAME = 'browse-library-catalogue-v1';
const FRESH_MS = 7 * 24 * 3600 * 1000;

export function datasetUrl(dataset: string, path: string): string {
  return `https://huggingface.co/datasets/${dataset}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * The parsed catalogue of one source. The tab-separated file (several MB) is kept in the browser's
 * cache for a week, so the second visit works offline and starts at once.
 */
export async function loadCatalog(source: BrowseSource, onProgress?: (received: number, total: number) => void): Promise<BrowseBook[]> {
  const url = datasetUrl(source.dataset, 'index.tsv');
  const cache = await openCache();
  const hit = cache ? await cache.match(url) : undefined;
  const age = hit ? Date.now() - Number(hit.headers.get('x-cached-at') ?? 0) : Infinity;
  if (hit && age < FRESH_MS) return parseIndex(await hit.text(), source.id);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The catalogue could not be loaded (${res.status}).`);
    const total = Number(res.headers.get('content-length')) || 0;
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        chunks.push(r.value);
        received += r.value.length;
        onProgress?.(received, total);
      }
    } else {
      chunks.push(new Uint8Array(await res.arrayBuffer()));
    }
    const text = new TextDecoder('utf-8').decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
    if (cache) {
      void cache.put(url, new Response(text, { headers: { 'content-type': 'text/tab-separated-values', 'x-cached-at': String(Date.now()) } })).catch(() => {});
    }
    return parseIndex(text, source.id);
  } catch (e) {
    // Offline or the host is down: an old copy is better than nothing.
    if (hit) return parseIndex(await hit.text(), source.id);
    throw e instanceof Error ? e : new Error('The catalogue could not be loaded.');
  }
}
