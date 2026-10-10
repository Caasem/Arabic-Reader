import { useEffect, useState } from 'react';
import type { CleanBook } from '../../cleanReader/parseCleanEpub';
import type { BookModel } from '../../quietReader/bookModel';
import { normalizeArabic } from '../arabic';
import type { OpenedPdf } from './pdfjsLoader';

/**
 * The text of PDF pages, for the reader's drawer and margin (Search, Words, Levels), which work on a BookModel:
 * here each page is a "chapter" titled "Page N". A page's text is its text layer's, run after run with a line
 * break where pdf.js puts one, so an offset in it lands on the same letter of the layer pdf.js draws
 * (`rangeInTextLayer`). Letters are folded the way tapped words are (presentation forms to plain letters, no
 * tatweel or bidi marks), with a map back to the layer's offsets. A scanned page has no text layer, so it has no
 * text here either.
 */
export interface PdfPageText {
  text: string;
  /** For each letter of `text`, its offset in the layer's text; one more entry for the end. */
  map: number[];
}

export interface PdfTextModel {
  model: BookModel;
  pages: PdfPageText[];
}

interface TextItem {
  str?: string;
  hasEOL?: boolean;
}

/** The layer's text: what pdf.js puts in the page's text layer, a line break for each <br>. */
export function layerText(items: readonly TextItem[]): string {
  let out = '';
  for (const item of items) {
    if (item.str === undefined) continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
  }
  return out;
}

/** Folds the layer's text letter by letter, keeping where each letter came from. */
export function foldPageText(raw: string): PdfPageText {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    for (const ch of normalizeArabic(raw[i])) {
      text += ch;
      map.push(i);
    }
  }
  map.push(raw.length);
  return { text, map };
}

const pageCache = new WeakMap<object, Map<number, Promise<PdfPageText>>>();

export function pdfPageText(opened: OpenedPdf, number: number): Promise<PdfPageText> {
  let pages = pageCache.get(opened.doc);
  if (!pages) pageCache.set(opened.doc, (pages = new Map()));
  let cached = pages.get(number);
  if (!cached) {
    cached = opened.doc
      .getPage(number)
      .then((page) => page.getTextContent())
      .then((content) => foldPageText(layerText(content.items as TextItem[])))
      .catch(() => ({ text: '', map: [0] }));
    pages.set(number, cached);
  }
  return cached;
}

const modelCache = new WeakMap<object, Promise<PdfTextModel>>();

/** Every page's text as one BookModel, read once per open document. */
export function pdfTextModel(opened: OpenedPdf, title: string): Promise<PdfTextModel> {
  let cached = modelCache.get(opened.doc);
  if (!cached) {
    cached = (async () => {
      const pages: PdfPageText[] = [];
      for (let n = 1; n <= opened.doc.numPages; n++) pages.push(await pdfPageText(opened, n));
      const book: CleanBook = { title, chapters: pages.map((_, i) => ({ title: `Page ${i + 1}`, blocks: [] })) };
      const texts = pages.map((p) => p.text);
      return { pages, model: { book, texts, chars: texts.map((t) => t.length), paragraphs: texts.map((t) => [0, t.length]) } };
    })();
    modelCache.set(opened.doc, cached);
  }
  return cached;
}

/** The text model once `wanted` (a panel that needs it is open); null while it is read. */
export function usePdfTextModel(opened: OpenedPdf | null, title: string, wanted: boolean): PdfTextModel | null {
  const [state, setState] = useState<{ doc: object; model: PdfTextModel } | null>(null);
  useEffect(() => {
    if (!opened || !wanted) return;
    let stale = false;
    void pdfTextModel(opened, title).then((model) => !stale && setState({ doc: opened.doc, model }));
    return () => {
      stale = true;
    };
  }, [opened, title, wanted]);
  return state && opened && state.doc === opened.doc ? state.model : null;
}

/** A DOM range over letters [start, end) of a page's folded text, inside that page's rendered text layer. */
export function rangeInTextLayer(layer: HTMLElement, page: PdfPageText, start: number, end: number): Range | null {
  const last = page.map.length - 1;
  const rawStart = page.map[Math.min(Math.max(start, 0), last)];
  const rawEnd = page.map[Math.min(Math.max(end, start), last)];
  if (rawEnd <= rawStart) return null;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const range = document.createRange();
  let at = 0;
  let started = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      if ((n as Element).tagName === 'BR') at += 1;
      continue;
    }
    const len = n.textContent?.length ?? 0;
    if (!started && rawStart < at + len) {
      range.setStart(n, Math.max(0, rawStart - at));
      started = true;
    }
    if (started && rawEnd <= at + len) {
      range.setEnd(n, Math.max(0, rawEnd - at));
      return range;
    }
    at += len;
  }
  return null;
}

/** Waits (up to `ms`) for page `number`'s text layer to be drawn, and returns it. */
export function textLayerOf(stage: HTMLElement | null, number: number, ms = 4000): Promise<HTMLElement | null> {
  const started = performance.now();
  return new Promise((resolve) => {
    const look = () => {
      const layer = stage?.querySelector<HTMLElement>(`.pdfp-page[data-page="${number}"] .pdfp-text`);
      if (layer?.childNodes.length) return resolve(layer);
      if (performance.now() - started > ms) return resolve(null);
      requestAnimationFrame(look);
    };
    look();
  });
}
