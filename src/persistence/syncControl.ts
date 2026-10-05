import { db as defaultDb, type ArabicReaderDB } from './schema';
import { SYNCED_TABLES, type SyncMetaRow, type SyncedTableName } from './syncedTables';
import { createWriteLayer } from './writeLayer';

/**
 * Switching sync on. Until this runs, the write layer only stamps `updatedAt`
 * and creates no events. Turning sync on seeds one `put` event per existing
 * row (spec: "First sync of existing data"), carrying each row's own
 * `updatedAt` so a device joining later does not clobber newer data elsewhere.
 *
 * There is deliberately no "turn off": deletes made while capture was off
 * would leave no tombstone, so the switch only goes one way (a reset would
 * start a new device identity instead).
 */

type Row = Record<string, unknown>;

export interface EnableResult {
  deviceId: string;
  /** Events seeded for pre-existing rows (0 if sync was already on). */
  seeded: number;
}

/** `createSyncControl` takes the database only so tests can run two devices in one process. */
export function createSyncControl(db: ArabicReaderDB) {
  const layer = createWriteLayer(db);

  async function getSyncMeta(): Promise<SyncMetaRow | undefined> {
    return db.syncMeta.get('local');
  }

  async function isSyncEnabled(): Promise<boolean> {
    return Boolean((await getSyncMeta())?.enabled);
  }


  async function enableSyncCapture(deviceName = 'This device'): Promise<EnableResult> {
    return db.transaction('rw', layer.allSyncedScope(), async () => {
      const existing = await db.syncMeta.get('local');
      if (existing?.enabled) return { deviceId: existing.deviceId, seeded: 0 };

      let meta: SyncMetaRow = {
        id: 'local',
        enabled: true,
        deviceId: crypto.randomUUID(),
        installId: crypto.randomUUID(),
        deviceName,
        lastUpdatedAt: 0,
        applied: { prefix: {}, extra: {} },
        clock: {},
      };
      await db.syncMeta.put(meta);

      // Oldest first across *all* tables, so the per-device monotonic `updatedAt`
      // only has to nudge ties instead of pushing older rows past newer ones.
      const rows: { table: SyncedTableName; row: Row }[] = [];
      for (const table of Object.keys(SYNCED_TABLES) as SyncedTableName[]) {
        for (const row of (await db.table(table).toArray()) as Row[]) rows.push({ table, row });
      }
      rows.sort((a, b) => Number(a.row.updatedAt ?? 0) - Number(b.row.updatedAt ?? 0));

      for (const { table, row } of rows) {
        const event = await layer.capture(meta, table, String(row[SYNCED_TABLES[table]]), 'put', row, Number(row.updatedAt ?? Date.now()));
        await db.table(table).put(event.payload as Row);
        meta = (await db.syncMeta.get('local')) as SyncMetaRow;
      }
      return { deviceId: meta.deviceId, seeded: rows.length };
    });
  }

  return { getSyncMeta, isSyncEnabled, enableSyncCapture };
}

export const { getSyncMeta, isSyncEnabled, enableSyncCapture } = createSyncControl(defaultDb);
