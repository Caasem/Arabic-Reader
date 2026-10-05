import type { SavedEntriesExport } from './buildExport';

/**
 * Reads several readers' export files for the same book and shows whether they saved the same entries
 * (docs/specs/crowd-sense-ranking.md, phase 0). Run by `scripts/summarize-saved-entries.mjs`.
 */
export interface EntrySummary {
  entryKey: string;
  headword?: string;
  verbForm?: string;
  /** How many readers saved it. */
  readers: number;
  /** Readers who saved it, out of the readers who saved anything for this word in this dictionary. */
  share: number;
}

export interface WordSummary {
  word: string;
  lemmaKey: string;
  dictionary: string;
  /** Readers who saved at least one entry of this word in this dictionary. */
  readers: number;
  entries: EntrySummary[];
  /** At least two readers, and one entry saved by at least 60% of them. */
  agrees: boolean;
}

export interface BookSummary {
  bookKey: string;
  title: string;
  files: number;
  words: WordSummary[];
  /** Words (per dictionary) that two or more readers saved from. */
  comparable: number;
  agreeing: number;
}

export const AGREE_SHARE = 0.6;

export function summarizeExports(exports: SavedEntriesExport[]): BookSummary[] {
  const books = new Map<string, SavedEntriesExport[]>();
  for (const e of exports) books.set(e.book.key, [...(books.get(e.book.key) ?? []), e]);

  return [...books.entries()].map(([bookKey, files]) => {
    // lemma|dictionary -> entryKey -> { readers, label }
    const cells = new Map<string, { word: string; lemmaKey: string; dictionary: string; readers: number; entries: Map<string, EntrySummary> }>();
    files.forEach((file) => {
      const seenCell = new Set<string>();
      const seenEntry = new Set<string>();
      for (const w of file.words) {
        for (const s of w.saves) {
          const cellKey = `${w.lemmaKey}|${s.dictionary}`;
          let cell = cells.get(cellKey);
          if (!cell) {
            cell = { word: w.word, lemmaKey: w.lemmaKey, dictionary: s.dictionary, readers: 0, entries: new Map() };
            cells.set(cellKey, cell);
          }
          if (!seenCell.has(cellKey)) {
            seenCell.add(cellKey);
            cell.readers++;
          }
          const entryId = `${cellKey}|${s.entryKey}`;
          if (seenEntry.has(entryId)) continue;
          seenEntry.add(entryId);
          const entry = cell.entries.get(s.entryKey) ?? { entryKey: s.entryKey, headword: s.headword, verbForm: s.verbForm, readers: 0, share: 0 };
          entry.readers++;
          cell.entries.set(s.entryKey, entry);
        }
      }
    });

    const words: WordSummary[] = [...cells.values()]
      .map((cell) => {
        const entries = [...cell.entries.values()]
          .map((e) => ({ ...e, share: e.readers / cell.readers }))
          .sort((a, b) => b.readers - a.readers || a.entryKey.localeCompare(b.entryKey));
        return {
          word: cell.word,
          lemmaKey: cell.lemmaKey,
          dictionary: cell.dictionary,
          readers: cell.readers,
          entries,
          agrees: cell.readers >= 2 && entries[0].share >= AGREE_SHARE,
        };
      })
      .sort((a, b) => b.readers - a.readers || a.word.localeCompare(b.word) || a.dictionary.localeCompare(b.dictionary));

    return {
      bookKey,
      title: files[0].book.title,
      files: files.length,
      words,
      comparable: words.filter((w) => w.readers >= 2).length,
      agreeing: words.filter((w) => w.agrees).length,
    };
  });
}

/** A readable report for the person running the test. */
export function formatSummary(summaries: BookSummary[]): string {
  const lines: string[] = [];
  for (const book of summaries) {
    lines.push(`${book.title}  (${book.files} reader file${book.files === 1 ? '' : 's'})`);
    const pct = book.comparable ? Math.round((book.agreeing / book.comparable) * 100) : 0;
    lines.push(`  Words two or more readers saved from: ${book.comparable}`);
    lines.push(`  Of those, readers agree on one entry (${Math.round(AGREE_SHARE * 100)}%+): ${book.agreeing} (${pct}%)`);
    for (const w of book.words.filter((x) => x.readers >= 2)) {
      lines.push(`  ${w.word || w.lemmaKey}  [${w.dictionary}]  ${w.readers} readers  ${w.agrees ? 'AGREE' : 'split'}`);
      for (const e of w.entries) {
        const label = [e.headword, e.verbForm ? `(${e.verbForm})` : ''].filter(Boolean).join(' ') || e.entryKey;
        lines.push(`      ${e.readers}/${w.readers}  ${label}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
