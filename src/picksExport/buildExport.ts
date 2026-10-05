import type { SensePickRow } from '../persistence/sensePicksRepo';

/**
 * The file a reader sends for the saved-entries test (docs/specs/crowd-sense-ranking.md, phase 0): which
 * dictionary entries they saved, for each word of one book. It holds no sentences, notes, cards, review
 * history, install ID or exact times, only the day of each save.
 */
export interface SavedEntriesExport {
  format: 'arabic-reader-saved-entries';
  version: 1;
  exportedAt: string;
  appVersion: string;
  book: { title: string; author?: string; key: string };
  words: {
    lemmaKey: string;
    word: string;
    saves: {
      dictionary: string;
      entryKey: string;
      headword?: string;
      verbForm?: string;
      senseKey?: string;
      source: SensePickRow['source'];
      day: string;
    }[];
  }[];
}

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function buildSavedEntriesExport(
  book: { title: string; author?: string },
  bookKey: string,
  rows: SensePickRow[],
  meta: { now: number; appVersion: string },
): SavedEntriesExport {
  const byWord = new Map<string, SensePickRow[]>();
  for (const row of rows) byWord.set(row.lemmaKey, [...(byWord.get(row.lemmaKey) ?? []), row]);

  const words = [...byWord.entries()]
    .map(([lemmaKey, list]) => ({
      lemmaKey,
      word: list.find((r) => r.word)?.word ?? '',
      saves: [...list]
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((r) => ({
          dictionary: r.providerId,
          entryKey: r.entryKey,
          ...(r.headword ? { headword: r.headword } : {}),
          ...(r.verbForm ? { verbForm: r.verbForm } : {}),
          ...(r.senseKey ? { senseKey: r.senseKey } : {}),
          source: r.source,
          day: day(r.updatedAt),
        })),
    }))
    .sort((a, b) => a.word.localeCompare(b.word) || a.lemmaKey.localeCompare(b.lemmaKey));

  return {
    format: 'arabic-reader-saved-entries',
    version: 1,
    exportedAt: new Date(meta.now).toISOString(),
    appVersion: meta.appVersion,
    book: { title: book.title, ...(book.author ? { author: book.author } : {}), key: bookKey },
    words,
  };
}

/** `saved-entries-<book>-<day>.json`, with the book name cleaned for a file name. */
export function savedEntriesFileName(title: string, now: number): string {
  const slug = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `saved-entries-${slug || 'book'}-${day(now)}.json`;
}
