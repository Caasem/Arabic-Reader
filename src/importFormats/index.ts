/**
 * Importing books that are not EPUB: TXT, Markdown, MOBI and AZW3 are converted to an EPUB when
 * they are added, so every reader, lookup and sync path works on them unchanged. The converted
 * EPUB is what the library stores; `BookMeta.format` remembers the original format.
 *
 * Touch points: `libraryService.importBook` (src/library/libraryService.ts), the Library's file
 * picker and drag-and-drop (src/components/library/Library.tsx), and the `BookFormat` type. To
 * remove: delete this folder, make importBook call importEpub only, and restore `.epub` as the
 * picker's only type. PDFs are converted too, by reading the text layer (pdf.js) and reflowing it; all of that lives in src/pdf.
 * Third-party code: marked (MIT), foliate-js mobi.js (MIT), fflate (MIT), pdfjs-dist (Apache-2.0,
 * loaded only when a PDF is added; see the Licence note in docs/features/formats-pdf.md).
 */
import type { BookFormat } from '../types';
import type { PdfDeps } from '../pdf/import/convert';
import { escapeXml, writeEpub, type Chapter, type EpubImage } from './epubWriter';
import { arabicShare, decodeText, textToChapters } from './text';

/** Extensions the library accepts, for the file picker. */
export const IMPORTABLE_EXTENSIONS = ['.epub', '.txt', '.md', '.markdown', '.mobi', '.azw3', '.azw', '.prc', '.pdf'];

const MAX_TEXT_BYTES = 50 * 1024 * 1024;

export function formatOf(fileName: string): BookFormat | null {
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  switch (ext) {
    case '.epub':
      return 'epub';
    case '.txt':
      return 'txt';
    case '.md':
    case '.markdown':
      return 'md';
    case '.mobi':
    case '.prc':
      return 'mobi';
    case '.azw3':
    case '.azw':
      return 'azw3';
    case '.pdf':
      return 'pdf';
    default:
      return null;
  }
}

export interface Converted {
  epub: File;
  format: BookFormat;
  chapters: number;
  /** Pages of the source, for a PDF. */
  pages?: number;
  /** For a PDF: how the text came out; the PDF itself is `original`. */
  pdf?: { pages: number; reflow: 'ok' | 'broken' | 'none' };
  original?: File;
  warnings: string[];
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

/** Converts a non-EPUB book file to an EPUB. Throws with a reader-facing message when it can't. */
export async function convertToEpub(file: File, options: { loadPdfDeps?: () => Promise<PdfDeps> } = {}): Promise<Converted> {
  const format = formatOf(file.name);
  if (!format || format === 'epub') throw new Error(`"${file.name}" is not a book type Arabic Reader can convert.`);
  const fallbackTitle = stripExt(file.name);
  const warnings: string[] = [];
  let title = fallbackTitle;
  let author: string | undefined;
  let language: string | undefined;
  let chapters: Chapter[];
  let images: EpubImage[] | undefined;
  let cover: EpubImage | undefined;
  let pages: number | undefined;
  let pdf: Converted['pdf'];

  if (format === 'txt' || format === 'md') {
    if (file.size > MAX_TEXT_BYTES) throw new Error('This file is too large to convert (limit 50 MB).');
    const decoded = decodeText(new Uint8Array(await file.arrayBuffer()));
    if (decoded.lossy) warnings.push('Some characters could not be read');
    if (!decoded.text.trim()) throw new Error('This file has no text to read.');
    if (format === 'txt') {
      ({ title, chapters } = textToChapters(decoded.text, fallbackTitle));
    } else {
      const { markdownToChapters } = await import('./markdown');
      const md = markdownToChapters(decoded.text, fallbackTitle);
      ({ title, author, chapters } = md);
      if (md.droppedImages) warnings.push(`${md.droppedImages} image${md.droppedImages === 1 ? '' : 's'} skipped`);
    }
  } else if (format === 'pdf') {
    const { convertPdf, PdfImportError, PDF_MESSAGES, MAX_PDF_BYTES } = await import('../pdf/import/convert');
    if (file.size > MAX_PDF_BYTES) throw new PdfImportError(PDF_MESSAGES.tooLarge);
    const loadPdfDeps = options.loadPdfDeps ?? (async () => (await import('../pdf/import/browser')).loadPdfDeps());
    const book = await convertPdf(new Uint8Array(await file.arrayBuffer()), await loadPdfDeps(), fallbackTitle);
    title = book.title ?? fallbackTitle;
    author = book.author;
    pages = book.pages;
    pdf = { pages: book.pages, reflow: book.reflow };
    warnings.push(...book.warnings);
    // A pages-only PDF still needs a book file for the library, stats and sync: a one-page stand-in.
    chapters = book.chapters.length
      ? book.chapters
      : [{ title: title, html: `<h2>${escapeXml(title)}</h2>
<p>${escapeXml(book.notice ?? '')}</p>` }];
  } else {
    const { mobiToChapters } = await import('./mobi');
    const book = await mobiToChapters(file);
    title = book.title?.trim() || fallbackTitle;
    author = book.author;
    language = book.language;
    chapters = book.chapters;
    images = book.images;
    cover = book.cover;
  }

  if (!chapters.length) throw new Error('This file has no text to read.');
  const sample = chapters
    .slice(0, 5)
    .map((c) => c.html.replace(/<[^>]+>/g, ' '))
    .join(' ');
  const rtl = arabicShare(sample) > 0.5;
  const epub = await writeEpub({ title, author, language: rtl ? 'ar' : (language ?? 'en'), rtl, chapters, images, cover });
  return { epub: new File([epub], `${fallbackTitle}.epub`, { type: 'application/epub+zip' }), format, chapters: chapters.length, pages, pdf, original: pdf ? file : undefined, warnings };
}
