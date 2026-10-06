import type { ArabicReaderDB } from '../persistence/schema';
import type { WriteLayer } from '../persistence/writeLayer';
import { isSyncedTable, type SyncedTableName } from '../persistence/syncedTables';
import { describeRecord, TABLE_LABELS, type RecordSummary } from './describe';
import { recordKey } from './types';

/**
 * The Sync activity screen's logic (docs/specs/storage-and-sync.md, section 7):
 * what sync overwrote, with Undo, and delete-versus-edit conflicts that need a
 * decision. Undo and resolution are ordinary new events written through the
 * write layer, never edits to history: other devices receive them like any
 * change, and they supersede what they replace.
 */

type Row = Record<string, unknown>;

export interface ActivityItem {
  id: string;
  table: string;
  tableLabel: string;
  recordId: string;
  at: number;
  /** After this the entry (and its Undo) is gone. */
  expiresAt: number;
  /** The version that is currently kept. */
  kept: RecordSummary;
  /** The version that lost, which Undo restores. */
  other: RecordSummary;
  /** The record was changed again after the overwrite; Undo needs confirming. */
  changedSince: boolean;
}

export interface ConflictItem {
  key: string;
  table: string;
  tableLabel: string;
  recordId: string;
  detectedAt: number;
  /** The edited version, which is still visible. It was deleted on another device. */
  edit: RecordSummary;
}

export type UndoResult = { status: 'undone' } | { status: 'changed-since' } | { status: 'gone' };
export type ConflictChoice = 'keep-edit' | 'delete';

export interface SyncActivityOptions {
  db: ArabicReaderDB;
  layer: Pick<WriteLayer, 'putSynced' | 'deleteSynced' | 'syncScope'>;
  now?: () => number;
}

export function createSyncActivity({ db, layer, now = Date.now }: SyncActivityOptions) {
  const label = (table: string) => TABLE_LABELS[table] ?? 'Item';

  async function listActivity(): Promise<ActivityItem[]> {
    const rows = (await db.activityLog.toArray()).filter((r) => r.expiresAt > now() && isSyncedTable(r.table));
    rows.sort((a, b) => b.at - a.at);
    const items: ActivityItem[] = [];
    for (const row of rows) {
      const frontier = (await db.recordFrontier.get(recordKey(row.table, row.recordId)))?.events ?? [];
      const current = (await db.table(row.table).get(row.recordId)) as Row | undefined;
      items.push({
        id: row.id,
        table: row.table,
        tableLabel: label(row.table),
        recordId: row.recordId,
        at: row.at,
        expiresAt: row.expiresAt,
        kept: describeRecord(row.table, row.winnerPayload ?? current),
        other: describeRecord(row.table, row.loserPayload),
        changedSince: isChangedSince(frontier, row.loserEventId, row.winnerEventId),
      });
    }
    return items;
  }

  async function listConflicts(): Promise<ConflictItem[]> {
    const rows = await db.syncConflicts.toArray();
    const items: ConflictItem[] = [];
    for (const row of rows) {
      const current = (await db.table(row.table).get(row.recordId)) as Row | undefined;
      items.push({
        key: row.key,
        table: row.table,
        tableLabel: label(row.table),
        recordId: row.recordId,
        detectedAt: row.detectedAt,
        edit: describeRecord(row.table, current),
      });
    }
    return items.sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Restore the version that lost, as a new edit. If the record has changed since
   * the overwrite, nothing happens unless `force` is set (the screen asks first).
   */
  async function undo(id: string, { force = false } = {}): Promise<UndoResult> {
    const row = await db.activityLog.get(id);
    if (!row || row.expiresAt <= now() || !isSyncedTable(row.table)) return { status: 'gone' };
    const table: SyncedTableName = row.table;
    const key = recordKey(table, row.recordId);

    const frontier = (await db.recordFrontier.get(key))?.events ?? [];
    if (isChangedSince(frontier, row.loserEventId, row.winnerEventId) && !force) return { status: 'changed-since' };

    await db.transaction('rw', [...layer.syncScope(table), db.activityLog, db.syncConflicts], async () => {
      // Name what this supersedes, so it does not depend on the clock alone.
      await layer.putSynced(table, row.loserPayload as object, { resolves: frontier.map((e) => e.eventId) });
      // A fresh edit now supersedes everything recorded for this record.
      await db.activityLog.filter((r) => r.table === table && r.recordId === row.recordId).delete();
      await db.syncConflicts.delete(key);
    });
    return { status: 'undone' };
  }

  /** Decide a delete-versus-edit conflict. Both choices are new events that supersede both sides. */
  async function resolveConflict(key: string, choice: ConflictChoice): Promise<UndoResult> {
    const conflict = await db.syncConflicts.get(key);
    if (!conflict || !isSyncedTable(conflict.table)) return { status: 'gone' };
    const table: SyncedTableName = conflict.table;

    await db.transaction('rw', [...layer.syncScope(table), db.activityLog, db.syncConflicts], async () => {
      let row = (await db.table(table).get(conflict.recordId)) as Row | undefined;
      if (!row) {
        // The edit should still be visible; if not, take it from the record's own history.
        const edit = (await db.recordFrontier.get(key))?.events.find((e) => e.op === 'put');
        row = edit?.payload as Row | undefined;
      }
      const resolves = ((await db.recordFrontier.get(key))?.events ?? []).map((e) => e.eventId);
      // A new edit that supersedes the delete and the old edit, naming both.
      if (row) await layer.putSynced(table, row, { resolves });
      if (choice === 'delete') await layer.deleteSynced(table, conflict.recordId, { resolves });
      await db.syncConflicts.delete(key);
      await db.activityLog.filter((r) => r.table === table && r.recordId === conflict.recordId).delete();
    });
    return { status: 'undone' };
  }

  return { listActivity, listConflicts, undo, resolveConflict };
}

/**
 * The record still looks the way the overwrite left it only while its frontier is
 * exactly the two events involved. Anything else, or the loser having already
 * been superseded, means it has changed since.
 */
function isChangedSince(
  frontier: { eventId: string }[],
  loserEventId: string,
  winnerEventId: string,
): boolean {
  if (!frontier.some((e) => e.eventId === loserEventId)) return true;
  return frontier.some((e) => e.eventId !== loserEventId && e.eventId !== winnerEventId);
}
