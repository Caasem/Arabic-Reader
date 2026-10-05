import type { ArabicReaderDB } from '../persistence/schema';
import { SYNCED_TABLES, type SyncMetaRow, type SyncedTableName } from '../persistence/syncedTables';
import {
  batchPath,
  encodeBatch,
  encodeSnapshot,
  parseBatch,
  parseBatchPath,
  parseSnapshot,
  parseSnapshotPath,
  snapshotPath,
} from './format';
import { applyEvent, joinApplied, joinClock, joinFrontier, reduceFrontier } from './merge';
import { betterFor } from './reducers';
import type { SyncTransport } from './transport';
import { recordKey, splitRecordKey, type AppliedState, type SyncEvent, type SyncState } from './types';

/**
 * One sync pass over a folder transport (docs/specs/storage-and-sync.md, section 5):
 * pull other devices' immutable batch files and apply them, then publish this
 * device's own outbox as a new batch file. Never appends to or rewrites a file.
 *
 * Remote apply is the one place besides the write layer that writes synced
 * tables, and it never creates outbox events (no echo).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const UNDO_WINDOW_MS = 90 * DAY_MS;
/** Own batch files are kept at least this long after a snapshot covers them (the spec's 90-day window). */
const RETENTION_MS = 90 * DAY_MS;
/** Write a snapshot once this many events have been applied since the last one. */
const SNAPSHOT_EVERY_EVENTS = 500;
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
  snapshotWritten: boolean;
  /** Own files deleted because a snapshot made them redundant. */
  pruned: number;
}

export interface SyncEngineOptions {
  db: ArabicReaderDB;
  transport: SyncTransport;
  now?: () => number;
  snapshotEvery?: number;
  retentionMs?: number;
}

type Row = Record<string, unknown>;

/** Fields that differ between two otherwise identical copies of a record. */
const VOLATILE_FIELDS = ['updatedAt', 'addedAt'];

/** True when two payloads say the same thing, ignoring when each copy was made. */
function sameContent(a: unknown, b: unknown): boolean {
  const strip = (v: unknown) =>
    JSON.stringify(
      Object.entries((v ?? {}) as Record<string, unknown>)
        .filter(([k]) => !VOLATILE_FIELDS.includes(k))
        .sort(([x], [y]) => (x < y ? -1 : 1)),
    );
  return strip(a) === strip(b);
}

/** How many events an applied-set covers. */
const appliedCount = (a: AppliedState): number =>
  Object.values(a.prefix).reduce((n, p) => n + p, 0) + Object.values(a.extra).reduce((n, e) => n + e.length, 0);

export function createSyncEngine({
  db,
  transport,
  now = Date.now,
  snapshotEvery = SNAPSHOT_EVERY_EVENTS,
  retentionMs = RETENTION_MS,
}: SyncEngineOptions) {
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
      // Two devices that made the same change (a starter book, say) have nothing to review.
      if (sameContent(loser.payload, reduced.winner.payload)) continue;
      await db.activityLog.put({
        id: `${loser.eventId}>${reduced.winner.eventId}`,
        at: now(),
        expiresAt: now() + UNDO_WINDOW_MS,
        table,
        recordId,
        loserEventId: loser.eventId,
        loserPayload: loser.payload,
        winnerEventId: reduced.winner.eventId,
        winnerPayload: reduced.winner.payload,
      });
    }
  }

  /**
   * Join other devices' snapshots, then apply remote events, and mark the files
   * processed, all atomically. Returns events actually applied.
   */
  async function applyRemote(events: SyncEvent[], files: string[], snapshots: SyncState[] = []): Promise<number> {
    return db.transaction('rw', scope(), async () => {
      const meta = await requireMeta();
      let applied = meta.applied;
      let clock = meta.clock;
      let count = 0;

      // Snapshots first: they bring everything their device had applied. Joining is
      // order-independent, so several snapshots (or ones that overlap) are fine.
      for (const snapshot of snapshots) {
        for (const [key, incoming] of Object.entries(snapshot.frontiers)) {
          const { table, recordId } = splitRecordKey(key);
          if (!(TABLES as string[]).includes(table)) continue;
          const local = (await db.recordFrontier.get(key))?.events ?? [];
          const joined = joinFrontier(local, incoming);
          const known = new Set(local.map((e) => e.eventId));
          const added = joined.filter((e) => !known.has(e.eventId)).length;
          if (added === 0 && joined.length === local.length) continue;
          await db.recordFrontier.put({ key, events: joined });
          await materialise(table as SyncedTableName, recordId, joined);
          count += added;
        }
        applied = joinApplied(applied, snapshot.applied);
        clock = joinClock(clock, snapshot.clock);
      }

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
    const snapshots: SyncState[] = [];
    const files: string[] = [];

    for (const path of await transport.list()) {
      const snapshotName = parseSnapshotPath(path);
      if (snapshotName) {
        if (snapshotName.deviceId === meta.deviceId || done.has(path)) continue;
        let text: string;
        try {
          text = await transport.read(path);
        } catch {
          result.retryLater++;
          continue;
        }
        const snapshot = parseSnapshot(text, snapshotName.deviceId, TABLES);
        if (snapshot.ok) {
          snapshots.push(snapshot.snapshot.state);
          files.push(path);
          result.filesRead++;
        } else if (snapshot.reason === 'newer-version') {
          result.fromNewerVersion++;
        } else {
          result.retryLater++; // partly synced or invalid: try again next time
        }
        continue;
      }
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
    if (files.length > 0) result.eventsApplied = await applyRemote(events, files, snapshots);
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

  /**
   * Write a snapshot when enough has been applied since the last one, check it
   * by reading it back, and only then delete what it makes redundant: this
   * device's older snapshots, and its own batch files that the snapshot covers
   * and that are past the retention window. Never touches another device's files.
   */
  async function compactIfDue(): Promise<{ snapshotWritten: boolean; pruned: number }> {
    const meta = await requireMeta();
    const total = appliedCount(meta.applied);
    if (total - (meta.lastSnapshotApplied ?? 0) < snapshotEvery) return { snapshotWritten: false, pruned: 0 };

    const files = await transport.list();
    const ownSnapshots = files.flatMap((path) => {
      const p = parseSnapshotPath(path);
      return p && p.deviceId === meta.deviceId ? [{ path, gen: p.gen }] : [];
    });
    const gen = Math.max(0, ...ownSnapshots.map((s) => s.gen)) + 1;
    const frontiers = Object.fromEntries((await db.recordFrontier.toArray()).map((row) => [row.key, row.events]));
    const state: SyncState = { applied: meta.applied, clock: meta.clock, frontiers };
    const snapshotId = crypto.randomUUID();
    const path = snapshotPath(meta.deviceId, gen, snapshotId);
    await transport.write(path, encodeSnapshot(meta.deviceId, snapshotId, gen, now(), state));

    // Nothing is deleted unless the file we just wrote reads back whole.
    const check = parseSnapshot(await transport.read(path), meta.deviceId, TABLES);
    if (!check.ok) throw new Error('The snapshot could not be verified, so nothing was cleaned up.');
    await db.syncMeta.update('local', { lastSnapshotApplied: total });

    let pruned = 0;
    for (const old of ownSnapshots) {
      await transport.remove(old.path);
      pruned++;
    }
    const covered = meta.applied.prefix[meta.deviceId] ?? 0;
    for (const file of files) {
      const batch = parseBatchPath(file);
      if (!batch || batch.deviceId !== meta.deviceId || batch.lastSeq > covered) continue;
      const parsed = parseBatch(await transport.read(file), meta.deviceId, TABLES);
      if (!parsed.ok) continue;
      const newest = Math.max(...parsed.batch.events.map((e) => e.updatedAt));
      if (newest > now() - retentionMs) continue;
      await transport.remove(file);
      pruned++;
    }
    return { snapshotWritten: true, pruned };
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
    const compacted = await compactIfDue();
    await pruneActivity();
    await db.syncMeta.update('local', { lastSyncedAt: now() });
    return { ...pulled, published, ...compacted };
  }

  return { pull, publish, syncNow };
}
