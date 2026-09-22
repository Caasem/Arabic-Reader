import type { BackupData, Highlight, HighlightColor, MasteryLevel, VocabularyItem, WordInstance } from '../types';
import { freshFsrsFields } from '../vocabulary/fsrs';

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export interface ParsedBackup {
  data: BackupData;
  /** Rows dropped because they were missing required fields. */
  skipped: number;
}

type Row = Record<string, unknown>;

const MASTERY_LEVELS: MasteryLevel[] = ['new', 'learning', 'known', 'mastered'];
const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'purple', 'red'];

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Validates an untrusted backup file before anything is written. Rows without
 * their identifying fields are dropped; rows from older or hand-edited files
 * that lack newer fields (e.g. FSRS state) get safe defaults, so an import can
 * never leave Review or the Dashboard reading malformed data.
 */
export function parseBackup(raw: unknown, now: number = Date.now()): ParsedBackup {
  if (!isRow(raw) || !Array.isArray(raw.vocabulary)) {
    throw new BackupFormatError('Not a recognizable backup file.');
  }
  if (raw.formatVersion !== undefined && raw.formatVersion !== 1) {
    throw new BackupFormatError(`This backup was made by a newer version of the app (format ${String(raw.formatVersion)}).`);
  }

  let skipped = 0;
  const keep = <T>(rows: unknown, normalize: (row: Row) => T | null): T[] => {
    if (!Array.isArray(rows)) return [];
    const out: T[] = [];
    for (const row of rows) {
      const value = isRow(row) ? normalize(row) : null;
      if (value) out.push(value);
      else skipped++;
    }
    return out;
  };

  const vocabulary = keep<VocabularyItem>(raw.vocabulary, (row) => {
    if (!str(row.id) || !str(row.surfaceForm) || !str(row.bookId)) return null;
    const fresh = freshFsrsFields(now);
    const hasFsrs = typeof row.fsrsDue === 'number';
    return {
      ...(row as unknown as VocabularyItem),
      meaning: typeof row.meaning === 'string' ? row.meaning : '',
      entries: Array.isArray(row.entries) ? (row.entries as VocabularyItem['entries']) : [],
      bookTitle: typeof row.bookTitle === 'string' ? row.bookTitle : '',
      addedAt: num(row.addedAt, now),
      lookupCount: num(row.lookupCount, 1),
      encounterCount: num(row.encounterCount, 1),
      mastery: MASTERY_LEVELS.includes(row.mastery as MasteryLevel) ? (row.mastery as MasteryLevel) : 'new',
      successfulRecalls: num(row.successfulRecalls, 0),
      fsrsDue: hasFsrs ? num(row.fsrsDue, now) : fresh.fsrsDue,
      fsrsStability: hasFsrs ? num(row.fsrsStability, fresh.fsrsStability) : fresh.fsrsStability,
      fsrsDifficulty: hasFsrs ? num(row.fsrsDifficulty, fresh.fsrsDifficulty) : fresh.fsrsDifficulty,
      fsrsScheduledDays: hasFsrs ? num(row.fsrsScheduledDays, 0) : fresh.fsrsScheduledDays,
      fsrsLearningSteps: hasFsrs ? num(row.fsrsLearningSteps, 0) : fresh.fsrsLearningSteps,
      fsrsReps: hasFsrs ? num(row.fsrsReps, 0) : fresh.fsrsReps,
      fsrsLapses: hasFsrs ? num(row.fsrsLapses, 0) : fresh.fsrsLapses,
      fsrsState: hasFsrs ? num(row.fsrsState, 0) : fresh.fsrsState,
    };
  });

  const wordInstances = keep<WordInstance>(raw.wordInstances, (row) => {
    if (!str(row.bookId) || !str(row.normalizedForm)) return null;
    const { key: _key, ...rest } = row;
    return {
      ...(rest as unknown as WordInstance),
      surfaceForm: typeof row.surfaceForm === 'string' ? row.surfaceForm : String(row.normalizedForm),
      encounterCount: num(row.encounterCount, 1),
      lookupCount: num(row.lookupCount, 0),
      firstSeenAt: num(row.firstSeenAt, now),
      lastSeenAt: num(row.lastSeenAt, now),
      saved: row.saved === true,
    };
  });

  const highlights = keep<Highlight>(raw.highlights, (row) => {
    if (!str(row.id) || !str(row.bookId) || !str(row.cfiRange)) return null;
    return {
      ...(row as unknown as Highlight),
      bookTitle: typeof row.bookTitle === 'string' ? row.bookTitle : '',
      text: typeof row.text === 'string' ? row.text : '',
      color: HIGHLIGHT_COLORS.includes(row.color as HighlightColor) ? (row.color as HighlightColor) : 'yellow',
      createdAt: num(row.createdAt, now),
      updatedAt: num(row.updatedAt, now),
    };
  });

  return {
    data: { formatVersion: 1, exportedAt: num(raw.exportedAt, now), vocabulary, wordInstances, highlights },
    skipped,
  };
}
