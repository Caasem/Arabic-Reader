import { applyEvent, createLocalEvent } from '../sync/merge';
import { recordKey, type SyncEvent, type SyncState } from '../sync/types';
import { signalLocalSyncChange } from './changeSignal';
import { ArabicReaderDB, db as defaultDb } from './schema';
import { SYNCED_TABLES, type SyncMetaRow, type SyncedTableName } from './syncedTables';

/**
 * The single write path for every synced table (docs/specs/storage-and-sync.md,
 * section 3). Every repo write goes through here and nothing else may write to
 * those tables (`writeLayerBoundary.test.ts` enforces that).
 *
 * Each call stamps `updatedAt`. Once sync has been switched on (see
 * `syncControl.ts`), the same transaction also appends an immutable event to
 * `syncOutbox` and updates the record's causal frontier, so a change and its
 * event are saved together or not at all.
 *
 * `createWriteLayer` takes the database as a parameter only so tests can run
 * two devices in one process; the app uses the default instance below.
 */

type Row = Record<string, unknown>;

/** `resolves`: ids of events this change explicitly supersedes (used by Undo and conflict resolution). */
export interface WriteOptions {
  resolves?: string[];
}

export function createWriteLayer(db: ArabicReaderDB, onCaptured: () => void = signalLocalSyncChange) {
  /** Tables a caller's own transaction must include so these helpers can join it. */
  const syncScope = (...tables: SyncedTableName[]) => [
    ...tables.map((t) => db.table(t)),
    db.syncMeta,
    db.syncOutbox,
    db.recordFrontier,
  ];

  const allSyncedScope = () => syncScope(...(Object.keys(SYNCED_TABLES) as SyncedTableName[]));

  const primaryKey = (table: SyncedTableName, record: Row): string => String(record[SYNCED_TABLES[table]]);

  /**
   * Record one change and return its event. Must run inside a transaction that
   * includes the sync tables. Also used by `syncControl.ts` (first-sync seeding).
   */
  async function capture(
    meta: SyncMetaRow,
    table: SyncedTableName,
    recordId: string,
    op: 'put' | 'delete',
    record: Row,
    now: number,
    resolves?: string[],
  ): Promise<SyncEvent> {
    const key = recordKey(table, recordId);
    const frontier = await db.recordFrontier.get(key);
    const state: SyncState = { applied: meta.applied, clock: meta.clock, frontiers: { [key]: frontier?.events ?? [] } };
    const draft = createLocalEvent(state, meta.deviceId, meta.lastUpdatedAt, {
      eventId: crypto.randomUUID(),
      table,
      recordId,
      op,
      payload: null,
      now,
      resolves,
    });
    const event: SyncEvent = { ...draft, payload: { ...record, updatedAt: draft.updatedAt } };
    const next = applyEvent(state, event);
    await db.syncMeta.put({ ...meta, lastUpdatedAt: event.updatedAt, applied: next.applied, clock: next.clock });
    await db.recordFrontier.put({ key, events: next.frontiers[key] });
    await db.syncOutbox.put(event);
    return event;
  }

  /** Insert or replace a row. */
  async function putSynced<T extends object>(
    table: SyncedTableName,
    record: T,
    options: WriteOptions = {},
  ): Promise<void> {
    let captured = false;
    await db.transaction('rw', syncScope(table), async () => {
      const meta = await db.syncMeta.get('local');
      const row = record as Row;
      const now = Date.now();
      if (!meta?.enabled) {
        await db.table(table).put({ ...row, updatedAt: now });
        return;
      }
      const event = await capture(meta, table, primaryKey(table, row), 'put', row, now, options.resolves);
      await db.table(table).put(event.payload as Row);
      captured = true;
    });
    if (captured) onCaptured();
  }

  /** Insert or replace many rows of one table, each with its own event. */
  async function bulkPutSynced<T extends object>(table: SyncedTableName, records: T[]): Promise<void> {
    if (records.length === 0) return;
    let captured = false;
    await db.transaction('rw', syncScope(table), async () => {
      const meta = await db.syncMeta.get('local');
      const now = Date.now();
      if (!meta?.enabled) {
        await db.table(table).bulkPut(records.map((r) => ({ ...(r as Row), updatedAt: now })));
        return;
      }
      let current: SyncMetaRow = meta;
      for (const record of records) {
        const row = record as Row;
        const event = await capture(current, table, primaryKey(table, row), 'put', row, now);
        await db.table(table).put(event.payload as Row);
        current = (await db.syncMeta.get('local')) as SyncMetaRow;
        captured = true;
      }
    });
    if (captured) onCaptured();
  }

  /** Merge a patch into an existing row; a no-op when the row does not exist. */
  async function updateSynced(table: SyncedTableName, id: string, patch: Row): Promise<void> {
    await db.transaction('rw', syncScope(table), async () => {
      const existing = (await db.table(table).get(id)) as Row | undefined;
      if (existing) await putSynced(table, { ...existing, ...patch });
    });
  }

  /**
   * Delete a row. With sync on, the delete event (and its tombstone in the
   * record's frontier) is what other devices receive; the local row is removed.
   */
  async function deleteSynced(table: SyncedTableName, id: string, options: WriteOptions = {}): Promise<void> {
    let captured = false;
    await db.transaction('rw', syncScope(table), async () => {
      const meta = await db.syncMeta.get('local');
      if (meta?.enabled && (await db.table(table).get(id))) {
        await capture(meta, table, id, 'delete', { [SYNCED_TABLES[table]]: id, deleted: true }, Date.now(), options.resolves);
        captured = true;
      }
      await db.table(table).delete(id);
    });
    if (captured) onCaptured();
  }

  return { syncScope, allSyncedScope, capture, putSynced, bulkPutSynced, updateSynced, deleteSynced };
}

export type WriteLayer = ReturnType<typeof createWriteLayer>;

const layer = createWriteLayer(defaultDb);
export const { syncScope, allSyncedScope, capture, putSynced, bulkPutSynced, updateSynced, deleteSynced } = layer;
