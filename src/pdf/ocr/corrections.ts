import type { WordOcrInfo } from '../../types';
import { readString, writeString } from '../../utils/storage';

/**
 * Corrections the reader made to words read from a scan, kept per book on this device. Two ways to
 * find one again: by where the word is on the page, and, for a read the dictionary does not know, by
 * the misread text itself (the same print misreads the same way every time it comes up).
 */
interface Fixes {
  /** `page:x:y` of the word's centre on a grid → corrected word. */
  pos: Record<string, string>;
  /** Misread text → corrected word. */
  read: Record<string, string>;
}

const MAX_ENTRIES = 3000;
const key = (bookId: string) => `arabic-reader:pdfFixes:${bookId}`;

/** A word's place on the page, coarse enough that a re-read of the same word lands on the same key. */
export function positionKey(page: number, box: WordOcrInfo['box']): string {
  return `${page}:${Math.round((box.x + box.w / 2) / 8)}:${Math.round((box.y + box.h / 2) / 12)}`;
}

function load(bookId: string): Fixes {
  try {
    const parsed = JSON.parse(readString(key(bookId)) ?? 'null') as Partial<Fixes> | null;
    return { pos: { ...(parsed?.pos ?? {}) }, read: { ...(parsed?.read ?? {}) } };
  } catch {
    return { pos: {}, read: {} };
  }
}

const trim = (map: Record<string, string>) => {
  const entries = Object.entries(map);
  return entries.length > MAX_ENTRIES ? Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES)) : map;
};

/** Remembers that the word read as `ocr.read` at `ocr.box` is really `word`. Putting it back to what was read forgets it. */
export function rememberCorrection(bookId: string, ocr: Pick<WordOcrInfo, 'read' | 'page' | 'box'>, word: string): void {
  const fixes = load(bookId);
  const at = positionKey(ocr.page, ocr.box);
  if (word === ocr.read) {
    delete fixes.pos[at];
    delete fixes.read[ocr.read];
  } else {
    fixes.pos[at] = word;
    fixes.read[ocr.read] = word;
  }
  writeString(key(bookId), JSON.stringify({ pos: trim(fixes.pos), read: trim(fixes.read) }));
}

/** The fix for the word at this place, else for this misread text, else undefined. */
export function recallCorrection(bookId: string, page: number, box: WordOcrInfo['box'], read: string, options: { readIsUnknown: boolean }): string | undefined {
  const fixes = load(bookId);
  return fixes.pos[positionKey(page, box)] ?? (options.readIsUnknown ? fixes.read[read] : undefined);
}
