import { spineIndexOfCfi } from '../reader/epub/cfi';
import type { CleanChapter } from '../readerCore/parseCleanEpub';

/**
 * A place in the clean text. Stored as "clean:<chapter>:<start>:<end>" in the
 * same fields the app keeps epub CFIs in (bookmarks, highlights, search jumps,
 * a vocabulary card's chapter), so Highlights, Library search and the rest can
 * open it without knowing which reader made it. Offsets count characters of
 * chapterText(chapter, { notes: true }). The old clean reader's "clean:<chapter>"
 * (no offsets) parses too.
 */
export interface CleanLocation {
  chapter: number;
  start: number;
  end: number;
}

const PREFIX = 'clean:';

export function isCleanLocation(value: string | null | undefined): value is string {
  return !!value && value.startsWith(PREFIX);
}

export function formatCleanLocation({ chapter, start, end }: CleanLocation): string {
  return `${PREFIX}${chapter}:${start}:${end}`;
}

export function parseCleanLocation(value: string | null | undefined): CleanLocation | null {
  if (!isCleanLocation(value)) return null;
  const [chapter, start = '0', end] = value.slice(PREFIX.length).split(':');
  const nums = [chapter, start, end ?? start].map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { chapter: nums[0], start: nums[1], end: Math.max(nums[1], nums[2]) };
}

/** The clean chapter an epub position (a CFI, or a section href) falls in. */
export function chapterForEpubPosition(chapters: CleanChapter[], cfi?: string, href?: string): number | null {
  const spine = cfi ? spineIndexOfCfi(cfi) : null;
  if (spine !== null) {
    // Sections without text have no clean chapter; use the nearest one before.
    let best: number | null = null;
    chapters.forEach((c, i) => {
      if (c.spineIndex !== undefined && c.spineIndex <= spine) best = i;
    });
    if (best !== null) return best;
  }
  if (href) {
    const file = href.split('#')[0];
    const index = chapters.findIndex((c) => !!c.href && (c.href === file || file.endsWith('/' + c.href) || c.href.endsWith('/' + file)));
    if (index !== -1) return index;
  }
  return null;
}
