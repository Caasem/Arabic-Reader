import type { HighlightColor } from '../types';

/** Where in the book something was captured, in the form a highlight stores it. */
export interface MarkCapture {
  text: string;
  /** An epub CFI range or a clean-text place ("clean:<chapter>:<start>:<end>"). */
  location: string;
  chapterHref: string;
  chapterLabel: string;
  /** The sentence around it, when the reader can tell. */
  sentence?: string;
  /** Taken from the visible page rather than from a selection. */
  fromPage?: boolean;
}

/** What the open reader offers the Alt+N note card and the Alt+F flashcard. */
export interface ReaderMarks {
  /** The text selected right now, or null. */
  captureSelection(): MarkCapture | null;
  /** The first sentence on the visible page, or null when this reader can't tell. */
  capturePage(): MarkCapture | null;
  /** The highlight already at this place, with its note. */
  existing(capture: MarkCapture): { note: string } | null;
  /** Highlights the place (or updates the highlight already there) with this note. */
  saveNote(capture: MarkCapture, note: string, color: HighlightColor): Promise<void>;
  /** A word was saved as a card: show it as saved wherever it is on the page. */
  wordSaved(word: string): void;
}

let current: ReaderMarks | null = null;
const listeners = new Set<() => void>();

/** The open reader registers itself while it is mounted. Returns an unregister function. */
export function registerReaderMarks(marks: ReaderMarks): () => void {
  current = marks;
  return () => {
    if (current === marks) current = null;
  };
}

export function getReaderMarks(): ReaderMarks | null {
  return current;
}

/** The open reader calls this whenever its text selection changes. */
export function announceReaderSelection(): void {
  listeners.forEach((l) => l());
}

export function subscribeReaderSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Arabic and Latin sentence-ending punctuation. */
const SENTENCE_END = /[.!؟?]+\s*/g;
const MAX_SENTENCE_CHARS = 400;

/** The span [start, end) of the sentence of `text` containing offset `at`, trimmed and capped to a readable length. */
export function sentenceSpan(text: string, at: number): { start: number; end: number } {
  let start = 0;
  let end = text.length;
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(text))) {
    const stop = match.index + match[0].length;
    if (at < stop) {
      end = stop;
      break;
    }
    start = stop;
  }
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end: Math.min(end, start + MAX_SENTENCE_CHARS) };
}

/** The sentence of `text` containing offset `at`. */
export function sentenceAt(text: string, at: number): string {
  const { start, end } = sentenceSpan(text, at);
  return text.slice(start, end);
}
