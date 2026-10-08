/** What is known about a word that was read from a scanned page (src/pdf/ocr), carried to the dictionary popup. */
export interface WordOcrInfo {
  /** No read of it was a word the dictionary knows. */
  suspect: boolean;
  /** Likely corrections, best first; only when suspect. */
  candidates: { word: string; why: string }[];
  /** Where the word came from: 'first read', 'a closer look', an engine's name, or 'remembered'. */
  via: string;
  /** Set once the reader corrected the word. */
  corrected?: boolean;
  /** The word as the engine first read it. */
  read: string;
  /** Where the word is, so a correction can be remembered: the page and its box in page points. */
  page: number;
  box: { x: number; y: number; w: number; h: number };
}
