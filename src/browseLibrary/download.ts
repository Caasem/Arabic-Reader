import { escapeXml, writeEpub, type Chapter } from '../importFormats/epubWriter';
import { decodeText } from '../importFormats/text';
import { DuplicateBookError, libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import { BROWSE_SOURCES, datasetUrl, type BrowseBook } from './catalog';

/** Pages per chapter in the converted book: the contents list stays short, and page markers keep citations by page. */
const PAGES_PER_CHAPTER = 10;

export type BrowseFormat = 'txt' | 'pdf';

/** What the reader asked for in the Browse panel. */
export interface AddRequest {
  format: BrowseFormat;
  /** Zero-based volume numbers, in order. */
  volumes: number[];
  /** `separate`: one book per volume. `combined`: one book of all the chosen volumes (text only). */
  mode: 'separate' | 'combined';
}

export interface AddResult {
  /** Books now on the shelf from this request, including ones that were already there. */
  books: BookMeta[];
  /** Volumes that could not be added, with the reason. */
  failed: { volume: number; message: string }[];
  /** PDFs whose text came out unreadable: those books open as page images only. */
  pagesOnly: number;
}

/** One volume's text split on the dataset's page marker. Empty pages stay, so page numbers match the printed book. */
export function splitPages(text: string): string[] {
  const pages = text.replace(/\r\n?/g, '\n').split(/^[ \t]*PAGE_SEPARATOR[ \t]*$/m).map((p) => p.trim());
  while (pages.length > 1 && !pages[pages.length - 1]) pages.pop();
  return pages;
}

function pageHtml(text: string, label: string): string {
  const paragraphs = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${escapeXml(l)}</p>`)
    .join('\n');
  return `<div class="page-marker" style="text-align:center;color:#888;font-size:0.8em;margin:1.4em 0 0.6em">[${escapeXml(label)}]</div>\n${paragraphs}`;
}

/** Volumes of page texts to chapters of ten pages each; volume numbers come from `numbers` (or 1, 2, …). */
export function volumesToChapters(volumes: string[][], title: string, numbers?: number[]): Chapter[] {
  const chapters: Chapter[] = [];
  volumes.forEach((pages, v) => {
    const prefix = volumes.length > 1 ? `المجلد ${(numbers?.[v] ?? v) + 1} — ` : '';
    for (let start = 0; start < pages.length; start += PAGES_PER_CHAPTER) {
      const end = Math.min(start + PAGES_PER_CHAPTER, pages.length);
      const heading = `${prefix}ص ${start + 1}–${end}`;
      const body = pages
        .slice(start, end)
        .map((p, i) => pageHtml(p, `${prefix}ص ${start + i + 1}`))
        .join('\n');
      chapters.push({ title: chapters.length === 0 ? title : heading, html: `<h2>${escapeXml(heading)}</h2>\n${body}` });
    }
  });
  return chapters;
}

/** `<title> — المجلد 2` for a volume of a multi-volume book. */
export function volumeTitle(title: string, volume: number, volumeCount: number): string {
  return volumeCount > 1 ? `${title} — المجلد ${volume + 1}` : title;
}

/** Remembers which catalogue entries became library books, so a second visit says "In your library". */
const ADDED_KEY = 'browseLibrary.added';

/** Key of one added file: a book, a format and a volume (or `all` for a combined book). */
export function addedKey(book: BrowseBook, format: BrowseFormat, volume: number | 'all'): string {
  return `${book.key}#${format}#${volume}`;
}

function readAdded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ADDED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function addedBookIds(): Record<string, string> {
  return readAdded();
}

function rememberAdded(key: string, bookId: string) {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify({ ...readAdded(), [key]: bookId }));
  } catch {
    // Without storage the only cost is losing the "In your library" hint.
  }
}

function sourceOf(book: BrowseBook) {
  const source = BROWSE_SOURCES.find((s) => s.id === book.sourceId);
  if (!source) throw new Error('Unknown book source.');
  return source;
}

export function pathsFor(book: BrowseBook, format: BrowseFormat): string[] {
  return format === 'pdf' ? book.pdfPaths : book.txtPaths;
}

const sizes = new Map<string, number | null>();

/** Bytes of one volume's file in this format, from a HEAD request (cached). Null when the host does not say. */
export async function fileSize(book: BrowseBook, format: BrowseFormat, volume: number): Promise<number | null> {
  const path = pathsFor(book, format)[volume];
  if (!path) return null;
  const url = datasetUrl(sourceOf(book).dataset, path);
  if (sizes.has(url)) return sizes.get(url) ?? null;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const n = res.ok ? Number(res.headers.get('content-length')) : 0;
    const size = n > 0 ? n : null;
    sizes.set(url, size);
    return size;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
  return `${(n / 1073741824).toFixed(1)} GB`;
}

/** Downloads a file, reporting bytes received (and the total when the host says it). */
async function download(url: string, onBytes: (got: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'This file is not in the collection any more.' : `The download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value);
    got += r.value.length;
    onBytes(got, total);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function sizeLabel(got: number, total: number): string {
  return total ? `${formatBytes(got)} of ${formatBytes(total)}` : formatBytes(got);
}

/** Adds the chosen volumes in the chosen format. A failed volume does not stop the others. */
export async function addBrowseBooks(book: BrowseBook, request: AddRequest, onProgress: (status: string) => void): Promise<AddResult> {
  const source = sourceOf(book);
  const paths = pathsFor(book, request.format);
  const volumeCount = Math.max(book.volumes, book.txtPaths.length);
  const result: AddResult = { books: [], failed: [], pagesOnly: 0 };
  const label = (v: number) => (request.volumes.length > 1 ? `volume ${v + 1}` : 'the book');
  const fetchVolume = (v: number) => download(datasetUrl(source.dataset, paths[v]), (got, total) => onProgress(`Downloading ${label(v)} · ${sizeLabel(got, total)}`));

  if (request.format === 'txt' && request.mode === 'combined') {
    const pages: string[][] = [];
    for (const v of request.volumes) pages.push(splitPages(decodeText(await fetchVolume(v)).text));
    onProgress('Building the book…');
    const chapters = volumesToChapters(pages, book.title, request.volumes);
    const blob = await writeEpub({ title: book.title, author: book.author || undefined, language: 'ar', rtl: true, chapters });
    const epub = new File([blob], `${book.title}.epub`, { type: 'application/epub+zip' });
    const meta = await libraryService.importEpub(epub, { format: 'txt', originalFileName: paths[request.volumes[0]]?.split('/').pop() });
    rememberAdded(addedKey(book, 'txt', 'all'), meta.id);
    result.books.push(meta);
    return result;
  }

  for (const v of request.volumes) {
    const title = volumeTitle(book.title, v, volumeCount);
    try {
      const bytes = await fetchVolume(v);
      onProgress(`Adding ${label(v)}…`);
      let meta: BookMeta;
      if (request.format === 'pdf') {
        const { meta: added, converted } = await libraryService.importBook(new File([bytes as BlobPart], `${title}.pdf`, { type: 'application/pdf' }));
        meta = added;
        if (converted?.reflow && converted.reflow !== 'ok') result.pagesOnly++;
      } else {
        const chapters = volumesToChapters([splitPages(decodeText(bytes).text)], title);
        const blob = await writeEpub({ title, author: book.author || undefined, language: 'ar', rtl: true, chapters });
        meta = await libraryService.importEpub(new File([blob], `${title}.epub`, { type: 'application/epub+zip' }), { format: 'txt', originalFileName: paths[v].split('/').pop() });
      }
      rememberAdded(addedKey(book, request.format, v), meta.id);
      result.books.push(meta);
    } catch (e) {
      if (e instanceof DuplicateBookError) {
        rememberAdded(addedKey(book, request.format, v), e.existing.id);
        result.books.push(e.existing);
      } else {
        result.failed.push({ volume: v, message: e instanceof Error ? e.message : 'Could not add this volume.' });
      }
    }
  }
  return result;
}
