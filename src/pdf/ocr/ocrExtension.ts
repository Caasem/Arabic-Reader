import { createElement } from 'react';
import type { PDFPageProxy } from '../pages/pdfjsLoader';
import type { PdfPageExtension, PdfWordTap } from '../pages/extensions';
import { cleanWord, wordBounds, type PointedWord } from '../pages/wordAtPoint';
import { recallCorrection } from './corrections';
import { cropPage, type Region } from './crop';
import { knownWords, wordRanks } from './dictionary';
import { initOcr } from './init';
import { OcrChip } from './OcrChip';
import { pageHasText } from './pageText';
import { lineOf, pickWord } from './pick';
import { refineRead, type Attempt } from './refine';
import { chosenOcrEngine } from './registry';
import { getOcrSettings, type Enhance } from './settings';
import { setOcrState } from './state';
import type { OcrEngine, OcrWord } from './types';

const LANGUAGE = 'ar';
/** A tap further than this many line heights from every word is a tap on blank paper. */
const MAX_TAP_DISTANCE_LINES = 1.2;
/** The closer looks taken at a word the dictionary does not know: [pixels per point, clean-up]. */
const CLOSER_LOOKS: [number, Enhance][] = [
  [6, 'contrast'],
  [6, 'binarize'],
  [8, 'contrast'],
];

let latest = 0;

/** The Arabic word inside an engine's token ("المدرسة،" → "المدرسة"), or null. */
function wordOf(token: string): string | null {
  const bounds = wordBounds(token, Math.floor(token.length / 2));
  return bounds ? cleanWord(token.slice(bounds[0], bounds[1])) || null : null;
}

/** Reads `region` of a page with an engine and returns the word nearest its centre. */
async function readNearCentre(engine: OcrEngine, page: PDFPageProxy, region: Region, scale: number, enhance: Enhance): Promise<string | null> {
  const crop = await cropPage(page, region, { scale, pad: 0.25, enhance });
  const words = await engine.recognize({ image: crop.image, width: crop.width, height: crop.height, language: LANGUAGE });
  const middle = { x: crop.width / 2, y: crop.height / 2 };
  const word = pickWord(words, middle);
  return word ? wordOf(word.text) : null;
}

/** Reads the line around a tap on a scanned page and returns the word under it. */
export async function wordAtTap(tap: PdfWordTap): Promise<PointedWord | null> {
  if (await pageHasText(tap.opened, tap.page)) return null;
  const mine = ++latest;
  const engine = chosenOcrEngine();
  if (!engine) {
    setOcrState({ phase: 'error', message: 'No text recognition is set up for this device. Add one in Settings → Reading.' });
    return null;
  }
  setOcrState({ phase: 'reading', engine: engine.name });
  try {
    const settings = getOcrSettings();
    const page = await tap.opened.doc.getPage(tap.page);
    const base = page.getViewport({ scale: 1 });
    const frame = tap.frame.getBoundingClientRect();
    const d = frame.width / base.width;
    const point = { x: (tap.clientX - frame.left) / d, y: (tap.clientY - frame.top) / d };
    const stripW = Math.min(base.width, Math.max(settings.stripPt * 14, 300));
    const crop = await cropPage(page, { x: point.x - stripW / 2, y: point.y - settings.stripPt / 2, w: stripW, h: settings.stripPt }, settings);
    const started = performance.now();
    const words = await engine.recognize({ image: crop.image, width: crop.width, height: crop.height, language: LANGUAGE });
    if (mine !== latest) return null;

    const tapPx = { x: (point.x - crop.region.x) * crop.scale + crop.margin, y: (point.y - crop.region.y) * crop.scale + crop.margin };
    const picked = pickWord(words, tapPx, settings.stripPt * crop.scale * MAX_TAP_DISTANCE_LINES);
    const first = picked ? wordOf(picked.text) : null;
    if (!picked || !first) {
      setOcrState({ phase: 'none', engine: engine.name, message: 'No word found there. Tap the word again, or try another engine.' });
      return null;
    }

    // The word's box on the page, in points.
    const box = {
      x: crop.region.x + (picked.x - crop.margin) / crop.scale,
      y: crop.region.y + (picked.y - crop.margin) / crop.scale,
      w: picked.w / crop.scale,
      h: picked.h / crop.scale,
    };
    const remembered = (word: string): PointedWord => ({
      word,
      run: lineOf(words as OcrWord[], picked),
      rect: new DOMRect(frame.left + box.x * d, frame.top + box.y * d, box.w * d, box.h * d),
      element: tap.frame,
      ocr: { suspect: false, candidates: [], via: 'remembered', read: first, page: tap.page, box },
    });
    const sameSpot = recallCorrection(tap.book.id, tap.page, box, first, { readIsUnknown: false });
    if (sameSpot) {
      setOcrState({ phase: 'done', engine: engine.name, ms: Math.round(performance.now() - started) });
      return remembered(sameSpot);
    }

    const closer: Region = { x: box.x - box.w * 0.1, y: box.y + box.h / 2 - Math.max(box.h, 10) * 0.7, w: box.w * 1.2, h: Math.max(box.h, 10) * 1.4 };
    const attempts: Attempt[] = CLOSER_LOOKS.map(([scale, enhance]) => ({
      label: 'a closer look',
      run: () => readNearCentre(engine, page, closer, scale, enhance),
    }));
    const refined = await refineRead(first, attempts, knownWords, wordRanks);
    if (mine !== latest) return null;

    const sameMisread = refined.suspect ? recallCorrection(tap.book.id, tap.page, box, first, { readIsUnknown: true }) : undefined;
    if (sameMisread) {
      setOcrState({ phase: 'done', engine: engine.name, ms: Math.round(performance.now() - started) });
      return remembered(sameMisread);
    }

    // On screen, so the popup sits next to the word.
    const left = frame.left + box.x * d;
    const top = frame.top + box.y * d;
    setOcrState({ phase: 'done', engine: engine.name, ms: Math.round(performance.now() - started), suspect: refined.suspect });
    return {
      word: refined.word,
      run: lineOf(words as OcrWord[], picked),
      rect: new DOMRect(left, top, box.w * d, box.h * d),
      element: tap.frame,
      ocr: { suspect: refined.suspect, candidates: refined.candidates.map(({ word, why }) => ({ word, why })), via: refined.via, read: first, page: tap.page, box },
    };
  } catch (error) {
    if (mine === latest) setOcrState({ phase: 'error', engine: engine.name, message: error instanceof Error ? error.message : 'Text recognition failed.' });
    return null;
  }
}

export const ocrExtension: PdfPageExtension = {
  id: 'ocr',
  wordAt: wordAtTap,
  Toolbar: ({ page, opened }) => createElement(OcrChip, { page, opened }),
};

/** Makes scanned pages tappable. Called once, when the pages view's code is loaded. */
export function registerOcr(register: (extension: PdfPageExtension) => void): void {
  initOcr();
  register(ocrExtension);
}
