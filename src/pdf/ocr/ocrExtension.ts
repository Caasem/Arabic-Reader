import { createElement } from 'react';
import type { PdfPageExtension, PdfWordTap } from '../pages/extensions';
import { cleanWord, wordBounds, type PointedWord } from '../pages/wordAtPoint';
import { cropPage } from './crop';
import { initOcr } from './init';
import { lineOf, pickWord } from './pick';
import { chosenOcrEngine } from './registry';
import { getOcrSettings } from './settings';
import { OcrChip } from './OcrChip';
import { pageHasText } from './pageText';
import { setOcrState } from './state';

const LANGUAGE = 'ar';
/** A tap further than this many line heights from every word is a tap on blank paper. */
const MAX_TAP_DISTANCE_LINES = 1.2;

let latest = 0;

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
    const word = pickWord(words, tapPx, settings.stripPt * crop.scale * MAX_TAP_DISTANCE_LINES);
    const bounds = word ? wordBounds(word.text, Math.floor(word.text.length / 2)) : null;
    if (!word || !bounds) {
      setOcrState({ phase: 'none', engine: engine.name, message: 'No word found there. Tap the word again, or try another engine.' });
      return null;
    }
    const text = cleanWord(word.text.slice(bounds[0], bounds[1]));
    // The word's box in the page as shown on screen, so the popup sits next to it.
    const left = frame.left + (crop.region.x + (word.x - crop.margin) / crop.scale) * d;
    const top = frame.top + (crop.region.y + (word.y - crop.margin) / crop.scale) * d;
    setOcrState({ phase: 'done', engine: engine.name, ms: Math.round(performance.now() - started) });
    return { word: text, run: lineOf(words, word), rect: new DOMRect(left, top, (word.w / crop.scale) * d, (word.h / crop.scale) * d), element: tap.frame };
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
