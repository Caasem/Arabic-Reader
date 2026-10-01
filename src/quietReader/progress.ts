/**
 * Where the reader is in the whole book, from how many characters each
 * chapter has. Page numbers are estimates: only the current chapter is laid
 * out, and the rest are counted at the same characters-per-page.
 */

/** 0-1 through the book: `fraction` is how far into `chapter`. */
export function bookProgress(chapterChars: number[], chapter: number, fraction: number): number {
  const total = chapterChars.reduce((sum, n) => sum + n, 0);
  if (!total) return 0;
  const before = chapterChars.slice(0, chapter).reduce((sum, n) => sum + n, 0);
  const within = (chapterChars[chapter] ?? 0) * Math.min(1, Math.max(0, fraction));
  return Math.min(1, (before + within) / total);
}

/** Where each chapter after the first begins, 0-1 (the progress rail's ticks). */
export function chapterStarts(chapterChars: number[]): number[] {
  const total = chapterChars.reduce((sum, n) => sum + n, 0);
  if (!total) return [];
  const starts: number[] = [];
  let seen = 0;
  for (let i = 0; i < chapterChars.length - 1; i++) {
    seen += chapterChars[i];
    starts.push(seen / total);
  }
  return starts;
}

export interface PageEstimate {
  /** 1-based. */
  current: number;
  total: number;
  /** Per chapter: its first and last page, 1-based. */
  ranges: [number, number][];
}

/**
 * Page numbers for the whole book. `pagesInChapter` is what the current
 * chapter really takes; `pageInChapter` is 0-based within it.
 */
export function estimatePages(chapterChars: number[], chapter: number, pagesInChapter: number, pageInChapter: number): PageEstimate {
  const pages = Math.max(1, pagesInChapter);
  const perPage = Math.max(1, (chapterChars[chapter] ?? 0) / pages);
  const ranges: [number, number][] = [];
  let next = 1;
  chapterChars.forEach((chars, i) => {
    const count = i === chapter ? pages : Math.max(1, Math.ceil(chars / perPage));
    ranges.push([next, next + count - 1]);
    next += count;
  });
  const first = ranges[chapter]?.[0] ?? 1;
  return { current: first + Math.min(pages - 1, Math.max(0, pageInChapter)), total: next - 1, ranges };
}
