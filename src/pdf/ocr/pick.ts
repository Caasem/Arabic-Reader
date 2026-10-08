import type { OcrWord } from './types';

const centreY = (w: OcrWord) => w.y + w.h / 2;

/** Distance from a point to a box (0 inside it). */
export function distanceToWord(word: OcrWord, point: { x: number; y: number }): number {
  const dx = Math.max(word.x - point.x, 0, point.x - (word.x + word.w));
  const dy = Math.max(word.y - point.y, 0, point.y - (word.y + word.h));
  return Math.hypot(dx, dy);
}

/** The word nearest to a point, or undefined when there are none or the nearest is too far to be meant. */
export function pickWord(words: OcrWord[], point: { x: number; y: number }, maxDistance = Infinity): OcrWord | undefined {
  let best: OcrWord | undefined;
  let bestDistance = Infinity;
  for (const word of words) {
    const d = distanceToWord(word, point);
    if (d < bestDistance) {
      best = word;
      bestDistance = d;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}

/** The text of the line a word is on, right to left, for the popup's sentence. */
export function lineOf(words: OcrWord[], word: OcrWord): string {
  const mid = centreY(word);
  return words
    .filter((w) => Math.abs(centreY(w) - mid) <= Math.max(w.h, word.h) * 0.5)
    .sort((a, b) => b.x + b.w - (a.x + a.w))
    .map((w) => w.text)
    .join(' ');
}
