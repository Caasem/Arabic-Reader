import Dexie, { type Table } from 'dexie';
import type {
  BookMeta,
  ReadingPosition,
  WordInstance,
  VocabularyItem,
  Highlight,
  Bookmark,
  ReaderPreferences,
  SpeedReaderPosition,
  SpeedReaderSession,
  ReadingSession,
  PomodoroSession,
} from '../types';
import { backfilledUpdatedAt, SYNCED_TABLES, type ActivityRow, type ConflictRow, type FrontierRow, type OutboxRow, type SyncMetaRow, type SyncedTableName } from './syncedTables';

/**
 * The IndexedDB schema, via Dexie. This is the only module that knows
 * storage is IndexedDB -- everything else depends on the PersistenceService
 * interface in db.ts, which is assembled from the repo modules in this
 * folder (booksRepo, vocabularyRepo, etc.), all built on the `db` below.
 */
export class ArabicReaderDB extends Dexie {
  books!: Table<BookMeta, string>;
  bookFiles!: Table<{ bookId: string; data: Blob }, string>;
  positions!: Table<ReadingPosition, string>;
  wordInstances!: Table<WordInstance & { key: string }, string>;
  vocabulary!: Table<VocabularyItem, string>;
  highlights!: Table<Highlight, string>;
  preferences!: Table<{ id: string; updatedAt?: number } & ReaderPreferences, string>;
  speedReaderPositions!: Table<SpeedReaderPosition, string>;
  speedReaderSessions!: Table<SpeedReaderSession, string>;
  readingSessions!: Table<ReadingSession, string>;
  bookmarks!: Table<Bookmark, string>;
  bookLocations!: Table<{ bookId: string; data: string; total: number }, string>;
  pomodoroSessions!: Table<PomodoroSession, string>;
  /** Single row (`id: 'local'`): sync identity, switch, and causal state. */
  syncMeta!: Table<SyncMetaRow, string>;
  /** Change events captured by the write layer, waiting to be published. */
  syncOutbox!: Table<OutboxRow, string>;
  /** Per-record causal frontier (see src/sync/merge.ts). */
  recordFrontier!: Table<FrontierRow, string>;
  /** Local-only record of changes sync overwrote, so the user can undo them. */
  activityLog!: Table<ActivityRow, string>;
  /** Records where a delete and an edit happened concurrently, awaiting the user. */
  syncConflicts!: Table<ConflictRow, string>;

  /** `name` is only ever overridden by tests that need two devices in one process. */
  constructor(name = 'arabic-reader') {
    super(name);
    this.version(1).stores({
      books: 'id, addedAt, title',
      bookFiles: 'bookId',
      positions: 'bookId',
      // key = `${bookId}::${normalizedForm}`
      wordInstances: 'key, bookId, normalizedForm, lemma',
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt',
      highlights: 'id, bookId, createdAt',
      preferences: 'id',
    });
    // v2: Leitner scheduling fields, indexed for "what's due" queries.
    this.version(2)
      .stores({
        vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, srDueAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table('vocabulary')
          .toCollection()
          .modify((item: VocabularyItem & { srBox?: number; srDueAt?: number }) => {
            if (item.srBox === undefined) item.srBox = 1;
            if (item.srDueAt === undefined) item.srDueAt = now;
          });
      });
    // v3: Leitner -> FSRS. Existing cards are re-seeded as fresh FSRS cards,
    // keeping their old due time so nothing loses its place in the queue.
    this.version(3)
      .stores({
        vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, fsrsDue',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table('vocabulary')
          .toCollection()
          .modify((item: VocabularyItem & { srBox?: number; srDueAt?: number }) => {
            if (item.fsrsDue === undefined) {
              item.fsrsDue = item.srDueAt ?? now;
              item.fsrsStability = 0;
              item.fsrsDifficulty = 0;
              item.fsrsScheduledDays = 0;
              item.fsrsLearningSteps = 0;
              item.fsrsReps = 0;
              item.fsrsLapses = 0;
              item.fsrsState = 0; // State.New
            }
          });
      });
    // v4: Speed Reader position + session log.
    this.version(4).stores({
      speedReaderPositions: 'bookId, updatedAt',
      speedReaderSessions: 'id, bookId, endedAt',
    });
    // v5: Reading Dashboard session log (range-scanned on startedAt).
    this.version(5).stores({
      readingSessions: 'id, bookId, startedAt, endedAt',
    });
    // v6: bookmarks.
    this.version(6).stores({
      bookmarks: 'id, bookId, createdAt',
    });
    // v7: cached epub.js locations index per book.
    this.version(7).stores({
      bookLocations: 'bookId',
    });
    // v8: Pomodoro sessions.
    this.version(8).stores({
      pomodoroSessions: 'id, bookId, phase, status, startedAt',
    });
    // v9: compound index for "is this word saved in this book" lookups,
    // which run on every word tap. Index-only change; no data migration.
    this.version(9).stores({
      vocabulary: 'id, surfaceForm, lemma, mastery, bookId, addedAt, fsrsDue, [bookId+surfaceForm]',
    });
    // v10: sync groundwork (docs/specs/storage-and-sync.md). `updatedAt` on every
    // synced row, plus the tables the write layer uses to capture changes. No
    // events are created here; they only start once sync is switched on.
    this.version(10)
      .stores({
        syncMeta: 'id',
        syncOutbox: 'eventId, publishedAt',
        recordFrontier: 'key',
        activityLog: 'id, at',
        syncConflicts: 'key',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        for (const table of Object.keys(SYNCED_TABLES) as SyncedTableName[]) {
          await tx
            .table(table)
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              if (typeof row.updatedAt !== 'number') row.updatedAt = backfilledUpdatedAt(table, row, now);
            });
        }
      });
  }
}

export const db = new ArabicReaderDB();

export interface TimeBounds {
  since?: number;
  until?: number;
}

/** Rows with `startedAt` in [since, until), in startedAt order, via the index. */
export function startedAtRange<T>(table: Table<T, string>, range?: TimeBounds): Promise<T[]> {
  if (range?.since === undefined && range?.until === undefined) return table.orderBy('startedAt').toArray();
  return table
    .where('startedAt')
    .between(range.since ?? -Infinity, range.until ?? Infinity, true, false)
    .toArray();
}
