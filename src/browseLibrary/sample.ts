import { decodeText } from '../importFormats/text';
import { knownWords } from '../pdf/ocr/dictionary';
import { BROWSE_SOURCES, datasetUrl, type BrowseBook } from './catalog';
import { splitPages } from './download';

/** How much of a book's text a preview or a quality check reads: enough for a few pages, far less than the book. */
const HEAD_BYTES = 40 * 1024;

/** The first bytes of a file, read as a stream and cut loose once enough has arrived. */
export async function fetchHead(url: string, maxBytes: number): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < maxBytes) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    got += r.value.length;
  }
  void reader.cancel().catch(() => {});
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Cuts at the last line break so a character is never split, then decodes. A file shorter than the cap is left whole. */
export function decodeHead(bytes: Uint8Array, complete: boolean): string {
  let end = bytes.length;
  if (!complete) {
    const last = bytes.lastIndexOf(0x0a);
    if (last > 0) end = last;
  }
  return decodeText(bytes.subarray(0, end)).text;
}

const heads = new Map<string, Promise<string>>();

/** The first part of the book's first volume as text (cached per book). */
export function headText(book: BrowseBook): Promise<string> {
  let p = heads.get(book.key);
  if (!p) {
    const source = BROWSE_SOURCES.find((s) => s.id === book.sourceId);
    if (!source || !book.txtPaths[0]) return Promise.reject(new Error('This book has no text to show.'));
    p = fetchHead(datasetUrl(source.dataset, book.txtPaths[0]), HEAD_BYTES).then((bytes) => decodeHead(bytes, bytes.length < HEAD_BYTES));
    p.catch(() => heads.delete(book.key));
    heads.set(book.key, p);
  }
  return p;
}

/** The first pages with something on them, as `[page number, text]`, capped so the preview stays short. */
export function firstPages(text: string, pages = 2, maxChars = 700): [number, string][] {
  const out: [number, string][] = [];
  let used = 0;
  splitPages(text).forEach((page, i) => {
    if (out.length >= pages || used >= maxChars || !page.trim()) return;
    const cut = page.length > maxChars - used ? `${page.slice(0, maxChars - used).trimEnd()}…` : page;
    out.push([i + 1, cut]);
    used += cut.length;
  });
  return out;
}

const ARABIC_WORD = /[ء-ي]{3,}/g;
const MAX_SAMPLE_WORDS = 160;

export interface Quality {
  /** Share of sampled words the dictionary reads as real words, 0..100. */
  percent: number;
  label: 'Clean' | 'Some errors' | 'Poor scan';
}

export function qualityLabel(percent: number): Quality['label'] {
  return percent >= 90 ? 'Clean' : percent >= 75 ? 'Some errors' : 'Poor scan';
}

/** The words of a sample that the dictionary reads as real words. Null when the text has too few words to say. */
export async function scoreText(text: string, known: (words: string[]) => Promise<Set<string>> = knownWords): Promise<Quality | null> {
  const words = [...new Set(text.match(ARABIC_WORD) ?? [])].slice(0, MAX_SAMPLE_WORDS);
  if (words.length < 12) return null;
  const real = await known(words);
  const percent = Math.round((words.filter((w) => real.has(w)).length / words.length) * 100);
  return { percent, label: qualityLabel(percent) };
}

const qualities = new Map<string, Promise<Quality | null>>();

/** How readable the book's machine-read text is, from a sample of its first pages (cached per book). */
export function qualityOf(book: BrowseBook): Promise<Quality | null> {
  let p = qualities.get(book.key);
  if (!p) {
    p = headText(book).then((text) => scoreText(text));
    p.catch(() => qualities.delete(book.key));
    qualities.set(book.key, p);
  }
  return p;
}
