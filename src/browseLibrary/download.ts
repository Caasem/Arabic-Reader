import { escapeXml, writeEpub, type Chapter } from '../importFormats/epubWriter';
import { decodeText } from '../importFormats/text';
import { libraryService } from '../library/libraryService';
import type { BookMeta } from '../types';
import { BROWSE_SOURCES, datasetUrl, type BrowseBook } from './catalog';

/** Pages per chapter in the converted book: the contents list stays short, and page markers keep citations by page. */
const PAGES_PER_CHAPTER = 10;

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

/** Volumes of page texts to chapters of ten pages each, numbered per volume. */
export function volumesToChapters(volumes: string[][], title: string): Chapter[] {
  const chapters: Chapter[] = [];
  volumes.forEach((pages, v) => {
    const prefix = volumes.length > 1 ? `المجلد ${v + 1} — ` : '';
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

const ADDED_KEY = 'browseLibrary.added';

function readAdded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ADDED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** Catalogue key to the id of the library book it became, so a second tap says "Already in your library". */
export function addedBookIds(): Record<string, string> {
  return readAdded();
}

function rememberAdded(key: string, bookId: string) {
  try {
    localStorage.setItem(ADDED_KEY, JSON.stringify({ ...readAdded(), [key]: bookId }));
  } catch {
    // Without storage the only cost is losing the "Already in your library" hint.
  }
}

/** Downloads the book's text (every volume), builds an EPUB and adds it to the library. */
export async function addBrowseBook(book: BrowseBook, onProgress: (status: string) => void): Promise<BookMeta> {
  const source = BROWSE_SOURCES.find((s) => s.id === book.sourceId);
  if (!source) throw new Error('Unknown book source.');
  const volumes: string[][] = [];
  for (let i = 0; i < book.txtPaths.length; i++) {
    onProgress(book.txtPaths.length > 1 ? `Downloading volume ${i + 1} of ${book.txtPaths.length}…` : 'Downloading…');
    const res = await fetch(datasetUrl(source.dataset, book.txtPaths[i]));
    if (!res.ok) throw new Error(res.status === 404 ? 'This book is not in the collection any more.' : `The download failed (${res.status}).`);
    volumes.push(splitPages(decodeText(new Uint8Array(await res.arrayBuffer())).text));
  }
  onProgress('Building the book…');
  const blob = await writeEpub({ title: book.title, author: book.author || undefined, language: 'ar', rtl: true, chapters: volumesToChapters(volumes, book.title) });
  const epub = new File([blob], `${book.title}.epub`, { type: 'application/epub+zip' });
  onProgress('Adding to your library…');
  const meta = await libraryService.importEpub(epub, { format: 'txt', originalFileName: book.txtPaths[0].split('/').pop() });
  rememberAdded(book.key, meta.id);
  return meta;
}
