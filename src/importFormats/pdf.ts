import type { Chapter } from './epubWriter';
import { assessText, type TextQuality, type WordAnalyser } from './pdfQuality';
import { reflowPages, type PageText } from './pdfReflow';
import { arabicShare } from './text';

/** The slice of pdf.js this converter uses, so tests and the app can each bring their own build. */
export interface PdfPage {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): void;
}
export interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  getMetadata(): Promise<{ info?: unknown }>;
  destroy(): Promise<void>;
}
export interface PdfDeps {
  openDocument(data: Uint8Array): Promise<PdfDocument>;
  analyse: WordAnalyser;
}

export const MAX_PDF_BYTES = 500 * 1024 * 1024;
const QUALITY_PAGES = 10;
/** A scanned book has no text on any page; do not walk a thousand pages to find that out. */
const SCAN_GIVE_UP = 30;
const MIN_PAGE_CHARS = 20;

export const PDF_MESSAGES = {
  tooLarge: 'This PDF is too large to convert (limit 500 MB).',
  password: 'This PDF is password-protected. Remove the password and add it again.',
  corrupt: 'This PDF could not be read.',
  scanned: 'This PDF is scanned images; text recognition is not available yet.',
  broken: 'The text in this PDF could not be extracted cleanly.',
} as const;

export class PdfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfImportError';
  }
}

export interface ConvertedPdf {
  title?: string;
  author?: string;
  rtl: boolean;
  chapters: Chapter[];
  pages: number;
  quality: TextQuality;
  warnings: string[];
}

interface RawItem {
  str?: string;
  transform?: number[];
  width?: number;
}

/** pdf.js text items → positioned runs. Marked-content markers (no `str`) are skipped. */
function toRuns(items: unknown[]): PageText['runs'] {
  const runs: PageText['runs'] = [];
  for (const item of items as RawItem[]) {
    if (typeof item.str !== 'string' || !item.str || !item.transform) continue;
    const [a, b, , , x, y] = item.transform;
    runs.push({ str: item.str, x, y, width: item.width ?? 0, size: Math.hypot(a, b) || 12 });
  }
  return runs;
}

const chars = (page: PageText) => page.runs.reduce((n, r) => n + r.str.trim().length, 0);

async function openOrExplain(deps: PdfDeps, data: Uint8Array): Promise<PdfDocument> {
  try {
    return await deps.openDocument(data);
  } catch (e) {
    throw new PdfImportError(e instanceof Error && e.name === 'PasswordException' ? PDF_MESSAGES.password : PDF_MESSAGES.corrupt);
  }
}

function readInfo(info: unknown): { title?: string; author?: string } {
  const record = (info ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\0/g, '').trim() : '');
  const title = clean(record.Title);
  const author = clean(record.Author);
  return {
    // Word processors leave their own name where the title goes.
    title: title.length > 1 && !/^(microsoft word|untitled|document\d*)/i.test(title) ? title : undefined,
    author: author || undefined,
  };
}

/**
 * Reads a text PDF into chapters (docs/features/formats-pdf.md). Throws a `PdfImportError` with a
 * reader-facing message for a PDF that is too big, password-protected, unreadable, scanned, or
 * whose text fails the quality test.
 */
export async function convertPdf(data: Uint8Array, deps: PdfDeps, fallbackTitle: string): Promise<ConvertedPdf> {
  if (data.length > MAX_PDF_BYTES) throw new PdfImportError(PDF_MESSAGES.tooLarge);
  const doc = await openOrExplain(deps, data);
  try {
    const pages: PageText[] = [];
    let textless = 0;
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const { width, height } = page.getViewport({ scale: 1 });
        const text: PageText = { width, height, runs: toRuns((await page.getTextContent()).items) };
        page.cleanup();
        pages.push(text);
        if (chars(text) >= MIN_PAGE_CHARS) textless = -Infinity;
        else if (++textless >= SCAN_GIVE_UP) break;
      }
    } catch {
      throw new PdfImportError(PDF_MESSAGES.corrupt);
    }

    const textPages = pages.filter((p) => chars(p) >= MIN_PAGE_CHARS);
    if (textPages.length < pages.length / 2 || !textPages.length) throw new PdfImportError(PDF_MESSAGES.scanned);

    const allText = textPages.map((p) => p.runs.map((r) => r.str).join(' ')).join('\n');
    const rtl = arabicShare(allText) > 0.5;

    // Quality: the first ten pages that have text, read as the lines the reader would see.
    const sampleRaw = textPages.slice(0, QUALITY_PAGES).map((p) => p.runs.map((r) => r.str).join(' ')).join('\n');
    const quality = await assessText(sampleRaw, deps.analyse);
    if (quality.verdict !== 'ok') throw new PdfImportError(PDF_MESSAGES.broken);

    const info = readInfo((await doc.getMetadata().catch(() => ({ info: undefined }))).info);
    const reflowed = reflowPages(textPages, rtl, info.title ?? fallbackTitle);
    if (!reflowed.chapters.length) throw new PdfImportError(PDF_MESSAGES.scanned);

    const warnings: string[] = [];
    const skipped = pages.length - textPages.length;
    if (skipped) warnings.push(`${skipped} page${skipped === 1 ? '' : 's'} without text left out`);

    return { ...info, rtl, chapters: reflowed.chapters, pages: doc.numPages, quality, warnings };
  } finally {
    await doc.destroy().catch(() => {});
  }
}
