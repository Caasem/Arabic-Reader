import type { OpenedPdf } from '../pdf/pages/pdfjsLoader';

/**
 * Highlighting on PDF pages: a box dragged over a page snaps to the words inside it. Pages with a text
 * layer give their words directly; scanned pages are read by the chosen text-recognition engine, which
 * returns every word with its box for the area dragged over (src/pdf/ocr). With snapping off, or when
 * nothing is read, the drag stays an image region.
 *
 * Boxes here are in fractions of the page (0..1), like the `pdf:<page>:x:y:w:h` places.
 */

export interface FracBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapWord extends FracBox {
  text: string;
}

export interface Snapped {
  /** The words' box, or the dragged box when no words were found. */
  box: FracBox;
  /** The words in reading order, or '' for an image region. */
  text: string;
  /** Where the words came from: the PDF's text layer, recognition, or none (an image region). */
  via: 'text' | 'ocr' | 'none';
}

const SNAP_KEY = 'studyDesk.pdfSnap';

export function snapEnabled(): boolean {
  try {
    return localStorage.getItem(SNAP_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSnapEnabled(on: boolean): void {
  try {
    localStorage.setItem(SNAP_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered: on next time.
  }
}

/** The smallest box around all of them. */
export function unionBox(boxes: FracBox[]): FracBox | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Words whose middle is inside the dragged box. */
export function wordsInside(words: SnapWord[], drag: FracBox): SnapWord[] {
  return words.filter((w) => {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    return cx >= drag.x && cx <= drag.x + drag.w && cy >= drag.y && cy <= drag.y + drag.h;
  });
}

/**
 * Words in reading order: lines top to bottom (a word joins a line when it overlaps the line's height by
 * half), and within a line right to left for Arabic, left to right otherwise.
 */
export function readingOrder(words: SnapWord[], rtl: boolean): string {
  const lines: SnapWord[][] = [];
  for (const w of [...words].sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => {
      const top = Math.max(...l.map((x) => x.y));
      const bottom = Math.min(...l.map((x) => x.y + x.h));
      const overlap = Math.min(bottom, w.y + w.h) - Math.max(top, w.y);
      return overlap > Math.min(w.h, bottom - top) / 2;
    });
    if (line) line.push(w);
    else lines.push([w]);
  }
  return lines.map((l) => l.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x)).map((w) => w.text).join(' ')).join('\n');
}

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

function finish(words: SnapWord[], drag: FracBox, via: 'text' | 'ocr'): Snapped | null {
  const inside = wordsInside(words, drag);
  const box = unionBox(inside);
  if (!box) return null;
  const rtl = inside.filter((w) => ARABIC.test(w.text)).length >= inside.length / 2;
  return { box, text: readingOrder(inside, rtl).replace(/[ \t]+/g, ' ').trim(), via };
}

/** Words of a page's text layer, from the spans the pages view draws (`.pdfp-text span`). */
function textLayerWords(frame: HTMLElement): SnapWord[] {
  const f = frame.getBoundingClientRect();
  if (!f.width || !f.height) return [];
  return Array.from(frame.querySelectorAll<HTMLElement>('.pdfp-text span'))
    .map((s) => ({ s, r: s.getBoundingClientRect() }))
    .filter(({ s, r }) => r.width > 0 && r.height > 0 && (s.textContent ?? '').trim())
    .map(({ s, r }) => ({ text: (s.textContent ?? '').trim(), x: (r.left - f.left) / f.width, y: (r.top - f.top) / f.height, w: r.width / f.width, h: r.height / f.height }));
}

/** Reads the dragged area of a scanned page with the chosen engine (the OCR module loads with the pages view). */
async function recognisedWords(opened: OpenedPdf, pageNumber: number, drag: FracBox): Promise<SnapWord[] | null> {
  const [{ chosenOcrEngine }, { cropPage }, { getOcrSettings }] = await Promise.all([import('../pdf/ocr/registry'), import('../pdf/ocr/crop'), import('../pdf/ocr/settings')]);
  const engine = chosenOcrEngine();
  if (!engine || !(await engine.status()).available) return null;
  const page = await opened.doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  // A little room around the drag, so words cut by its edge are read whole.
  const region = { x: (drag.x - 0.02) * base.width, y: (drag.y - 0.01) * base.height, w: (drag.w + 0.04) * base.width, h: (drag.h + 0.02) * base.height };
  const settings = getOcrSettings();
  const crop = await cropPage(page, region, { scale: Math.min(settings.scale, 4), pad: 0, enhance: settings.enhance });
  const found = await engine.recognize({ image: crop.image, width: crop.width, height: crop.height, language: 'ar' });
  return found.map((w) => ({
    text: w.text,
    x: (crop.region.x + (w.x - crop.margin) / crop.scale) / base.width,
    y: (crop.region.y + (w.y - crop.margin) / crop.scale) / base.height,
    w: w.w / crop.scale / base.width,
    h: w.h / crop.scale / base.height,
  }));
}

/**
 * Snaps a dragged box (fractions of the page) to the words inside it. `opened` is needed for scanned
 * pages only. Returns the dragged box itself as an image region when snapping is off or nothing is read.
 */
export async function snapDrag(frame: HTMLElement, pageNumber: number, drag: FracBox, opts: { snap: boolean; opened: OpenedPdf | null }): Promise<Snapped> {
  const region: Snapped = { box: drag, text: '', via: 'none' };
  if (!opts.snap) return region;
  const fromText = finish(textLayerWords(frame), drag, 'text');
  if (fromText) return fromText;
  if (!opts.opened) return region;
  try {
    const words = await recognisedWords(opts.opened, pageNumber, drag);
    return (words && finish(words, drag, 'ocr')) || region;
  } catch {
    return region;
  }
}
