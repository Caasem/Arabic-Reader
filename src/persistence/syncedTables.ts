import type { AppliedState, SeqMap, SyncEvent } from '../sync/types';

/**
 * The user-data tables that take part in sync, with each one's primary-key
 * field. Everything else in the database (book files, locations index, word
 * instances, caches) is local or replaceable and never produces sync events.
 */
export const SYNCED_TABLES = {
  books: 'id',
  positions: 'bookId',
  vocabulary: 'id',
  highlights: 'id',
  bookmarks: 'id',
  preferences: 'id',
  speedReaderPositions: 'bookId',
  speedReaderSessions: 'id',
  readingSessions: 'id',
  pomodoroSessions: 'id',
} as const;

export type SyncedTableName = keyof typeof SYNCED_TABLES;

export const isSyncedTable = (name: string): name is SyncedTableName => name in SYNCED_TABLES;

/** Row shape of the single `syncMeta` record. */
export interface SyncMetaRow {
  id: 'local';
  /** Capture is a no-op until sync is first switched on. */
  enabled: boolean;
  deviceId: string;
  /** Random per database; see "Device identity and restore" in the spec. */
  installId: string;
  deviceName: string;
  /** Highest `updatedAt` this device has issued, so it stays strictly increasing. */
  lastUpdatedAt: number;
  applied: AppliedState;
  clock: SeqMap;
  /** Remote batch files already applied (`<deviceId>/<file>`), so a pull skips them. */
  processedFiles?: string[];
  /** When the last full sync pass finished. */
  lastSyncedAt?: number;
  /** Events applied (all devices) when this device last wrote a snapshot, to decide when the next is due. */
  lastSnapshotApplied?: number;
}

/** An event waiting to be published; `publishedAt` is set once the log write is confirmed. */
export type OutboxRow = SyncEvent & { publishedAt?: number };

export interface FrontierRow {
  /** `recordKey(table, recordId)`. */
  key: string;
  events: SyncEvent[];
}

/**
 * `updatedAt` for a row that predates schema v10: its own newest timestamp
 * where it has one, else the migration time.
 */
export function backfilledUpdatedAt(table: SyncedTableName, row: Record<string, unknown>, now: number): number {
  const num = (k: string): number | undefined => (typeof row[k] === 'number' ? (row[k] as number) : undefined);
  switch (table) {
    case 'books':
    case 'vocabulary':
      return num('addedAt') ?? now;
    case 'highlights':
    case 'bookmarks':
      return num('createdAt') ?? now;
    case 'speedReaderSessions':
    case 'readingSessions':
    case 'pomodoroSessions':
      return num('endedAt') ?? num('startedAt') ?? now;
    default:
      return now;
  }
}

/**
 * A change that sync overwrote, kept on this device only (never synced) so the
 * user can undo it until `expiresAt` (90 days).
 */
export interface ActivityRow {
  id: string;
  at: number;
  expiresAt: number;
  table: string;
  recordId: string;
  /** The concurrent event that lost, with the payload it carried. */
  loserEventId: string;
  loserPayload: unknown;
  winnerEventId: string;
}

/** A delete and an edit of the same record happened concurrently. Both are kept until resolved. */
export interface ConflictRow {
  /** `recordKey(table, recordId)`. */
  key: string;
  table: string;
  recordId: string;
  detectedAt: number;
  /** Event ids involved (the frontier at detection time). */
  eventIds: string[];
}
