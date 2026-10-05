import type { ArabicReaderDB } from '../persistence/schema';
import { SYNCED_TABLES, type SyncMetaRow, type SyncedTableName } from '../persistence/syncedTables';
import { batchPath, encodeBatch, parseBatch, parseBatchPath } from './format';
import { applyEvent, reduceFrontier } from './merge';
import { betterFor } from './reducers';
import type { SyncTransport } from './transport';
import { recordKey, type SyncEvent, type SyncState } from './types';

/**
 * One sync pass over a folder transport (docs/specs/storage-and-sync.md, section 5):
 * pull other devices' immutable batch files and apply them, then publish this
 * device's own outbox as a new batch file. Never appends to or rewrites a file.
 *
 * Remote apply is the one place besides the write layer that writes synced
 * tables, and it never creates outbox events (no echo).
 */

const UNDO_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_BATCH = 500;
const TABLES = Object.keys(SYNCED_TABLES) as SyncedTableName[];

export interface PullResult {
  filesRead: number;
  eventsApplied: number;
  /** Files that could not be used yet (partly synced) and will be retried. */
  retryLater: number;
  /** Files written by a newer app version; skipped, and the user should be told to update. */
  fromNewerVersion: number;
}

export interface SyncResult extends PullResult {
  published: number;
}

export interface SyncEngineOptions {
  db: ArabicReaderDB;
  transport: SyncTransport;
  now?: () => number;
}

type Row = Record<string, unknown>;

export function createSyncEngine({ db, transport, now = Date.now }: SyncEngineOptions) {
  const scope = () => [
    ...TABLES.map((t) => db.table(t)),
    db.syncMeta,
    db.recordFrontier,
    db.activityLog,
    db.syncConflicts,
  ];

  async function requireMeta(): Promise<SyncMetaRow> {
    const meta = await db.syncMeta.get('local');
    if (!meta?.enabled) throw new Error('Sync is not switched on for this device.');
    return meta;
  }

  /** Bring one record's visible row in line with its (new) frontier. */
  async function materialise(table: SyncedTableName, recordId: string, frontier: SyncEvent[]): Promise<void> {
    const key = recordKey(table, recordId);
    const puts = frontier.filter((e) => e.op === 'put');
    const hasDelete = frontier.some((e) => e.op === 'delete');

    if (puts.length > 0 && hasDelete) {
      // A delete and an edit are concurrent: keep the edit visible and ask the user.
      await db.syncConflicts.put({
        key,
        table,
        recordId,
        detectedAt: now(),
        eventIds: frontier.map((e) => e.eventId),
      });
    } else {
      await db.syncConflicts.delete(key);
    }

    if (puts.length === 0) {
      await db.table(table).delete(recordId);
      return;
    }
    const reduced = reduceFrontier(puts, betterFor(table));
    if (!reduced) return;
    await db.table(table).put(reduced.winner.payload as Row);
    for (const loser of reduced.losers) {
      await db.activityLog.put({
        id: `${loser.eventId}>${reduced.winner.eventId}`,
        at: now(),
        expiresAt: now() + UNDO_WINDOW_MS,
        table,
        recordId,
        loserEventId: loser.eventId,
        loserPayload: loser.payload,
        winnerEventId: reduced.winner.eventId,
      });
    }
  }

  /** Apply remote events and mark their files processed, atomically. Returns events actually applied. */
  async function applyRemote(events: SyncEvent[], files: string[]): Promise<number> {
    return db.transaction('rw', scope(), async () => {
      const meta = await requireMeta();
      let applied = meta.applied;
      let clock = meta.clock;
      let count = 0;
      const ordered = [...events].sort((a, b) =>
        a.deviceId === b.deviceId ? a.seq - b.seq : a.deviceId < b.deviceId ? -1 : 1,
      );
      for (const event of ordered) {
        const key = recordKey(event.table, event.recordId);
        const previous = (await db.recordFrontier.get(key))?.events ?? [];
        const state: SyncState = { applied, clock, frontiers: { [key]: previous } };
        const next = applyEvent(state, event);
        if (next === state) continue; // already applied
        applied = next.applied;
        clock = next.clock;
        const frontier = next.frontiers[key];
        await db.recordFrontier.put({ key, events: frontier });
        await materialise(event.table as SyncedTableName, event.recordId, frontier);
        count++;
      }
      await db.syncMeta.put({
        ...meta,
        applied,
        clock,
        processedFiles: [...new Set([...(meta.processedFiles ?? []), ...files])],
      });
      return count;
    });
  }

  /** Read every batch file from other devices that has not been applied yet. */
  async function pull(): Promise<PullResult> {
    const meta = await requireMeta();
    const done = new Set(meta.processedFiles ?? []);
    const result: PullResult = { filesRead: 0, eventsApplied: 0, retryLater: 0, fromNewerVersion: 0 };
    const events: SyncEvent[] = [];
    const files: string[] = [];

    for (const path of await transport.list()) {
      const parsed = parseBatchPath(path);
      if (!parsed || parsed.deviceId === meta.deviceId || done.has(path)) continue;
      let text: string;
      try {
        text = await transport.read(path);
      } catch {
        result.retryLater++;
        continue;
      }
      const batch = parseBatch(text, parsed.deviceId, TABLES);
      if (batch.ok) {
        events.push(...batch.batch.events);
        files.push(path);
        result.filesRead++;
      } else if (batch.reason === 'newer-version') {
        result.fromNewerVersion++;
      } else {
        result.retryLater++; // unreadable, incomplete or invalid: try again next time
      }
    }
    if (files.length > 0) result.eventsApplied = await applyRemote(events, files);
    return result;
  }

  /** Write this device's unpublished outbox as new batch file(s). Returns events published. */
  async function publish(): Promise<number> {
    const meta = await requireMeta();
    const pending = (await db.syncOutbox.filter((e) => e.publishedAt === undefined).toArray()).sort((a, b) => a.seq - b.seq);
    let published = 0;
    for (let i = 0; i < pending.length; i += MAX_EVENTS_PER_BATCH) {
      const chunk = pending.slice(i, i + MAX_EVENTS_PER_BATCH);
      const events: SyncEvent[] = chunk.map(({ publishedAt: _p, ...event }) => event);
      const batchId = crypto.randomUUID();
      const path = batchPath(meta.deviceId, chunk[0].seq, chunk[chunk.length - 1].seq, batchId);
      await transport.write(path, encodeBatch(meta.deviceId, batchId, events));
      // Only after the file write is confirmed. A crash in between just republishes
      // the same events in a new file; readers ignore events they already applied.
      const stamp = now();
      await db.syncOutbox.bulkPut(chunk.map((row) => ({ ...row, publishedAt: stamp })));
      published += chunk.length;
    }
    return published;
  }

  /** Remove undo entries past their window. */
  async function pruneActivity(): Promise<void> {
    const cutoff = now();
    await db.activityLog.filter((row) => row.expiresAt <= cutoff).delete();
  }

  /** One full pass: pull first (so our next events cover what we received), then publish. */
  async function syncNow(): Promise<SyncResult> {
    const pulled = await pull();
    const published = await publish();
    await pruneActivity();
    await db.syncMeta.update('local', { lastSyncedAt: now() });
    return { ...pulled, published };
  }

  return { pull, publish, syncNow };
}
