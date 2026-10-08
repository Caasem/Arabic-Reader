import { loadPersonalDictionary, savePersonalDictionary } from '../dictionary/providers/personal/store';
import { db } from '../persistence/schema';
import { SYNCED_TABLES, isSyncedTable } from '../persistence/syncedTables';
import { bulkPutSynced } from '../persistence/writeLayer';
import { getAllWordInstances, upsertWordInstancesBulk } from '../persistence/wordInstancesRepo';
import { DESK_DB, MAIN_DB, STORAGE_REGISTRY, type StoreSpec } from '../storage/registry';
import * as deskStore from '../studyDesk/deskStore';

type Row = Record<string, unknown>;

export interface RestoreResult {
  /** Rows written (new, or newer than what was here). */
  written: number;
  /** Rows left alone because this device already has them, or has a newer version. */
  kept: number;
  /** Rows that were not usable (not an object, or missing their key). */
  skipped: number;
}

/** One JSON-exported store: how to read all its rows, and how to put rows back without losing newer data. */
export interface RecordStore {
  /** The StorageRegistry id. */
  id: string;
  read(): Promise<unknown[]>;
  restore(rows: unknown[]): Promise<RestoreResult>;
}

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const stamp = (row: Row, field: string): number => (typeof row[field] === 'number' ? (row[field] as number) : 0);

/**
 * Splits incoming rows into those to write and those to keep out: a row is written when this device has no row
 * with its key, or has an older one (by `field`). Equal or newer local rows win, so an import never undoes work
 * done since the export.
 */
async function newerThanLocal(
  rows: unknown[],
  keyField: string,
  field: string,
  getLocal: (keys: string[]) => Promise<(Row | undefined)[]>,
): Promise<{ toWrite: Row[]; result: RestoreResult }> {
  const usable = rows.filter((r): r is Row => isRow(r) && typeof r[keyField] === 'string' && (r[keyField] as string).length > 0);
  const local = await getLocal(usable.map((r) => r[keyField] as string));
  const toWrite = usable.filter((row, i) => !local[i] || stamp(local[i]!, field) < stamp(row, field));
  return { toWrite, result: { written: toWrite.length, kept: usable.length - toWrite.length, skipped: rows.length - usable.length } };
}

function syncedStore(name: keyof typeof SYNCED_TABLES): RecordStore {
  const key = SYNCED_TABLES[name];
  return {
    id: name,
    read: () => db.table(name).toArray(),
    async restore(rows) {
      const { toWrite, result } = await newerThanLocal(rows, key, 'updatedAt', (keys) => db.table(name).bulkGet(keys));
      await bulkPutSynced(name, toWrite);
      return result;
    },
  };
}

const wordInstances: RecordStore = {
  id: 'wordInstances',
  read: () => getAllWordInstances(),
  async restore(rows) {
    const withKey = rows.filter(isRow).map((r) => ({ ...r, key: `${String(r.bookId)}::${String(r.normalizedForm)}` }));
    const { toWrite, result } = await newerThanLocal(withKey, 'key', 'lastSeenAt', (keys) => db.wordInstances.bulkGet(keys) as Promise<(Row | undefined)[]>);
    await upsertWordInstancesBulk(toWrite as never);
    return { ...result, skipped: rows.length - withKey.length + result.skipped };
  },
};

const sensePicks: RecordStore = {
  id: 'sensePicks',
  read: () => db.sensePicks.toArray(),
  async restore(rows) {
    const { toWrite, result } = await newerThanLocal(rows, 'key', 'updatedAt', (keys) => db.sensePicks.bulkGet(keys) as Promise<(Row | undefined)[]>);
    await db.sensePicks.bulkPut(toWrite as never);
    return result;
  },
};

const personalDictionary: RecordStore = {
  id: 'arabic-reader-personal-dictionary/dictionaries',
  async read() {
    const stored = await loadPersonalDictionary();
    return stored ? [stored] : [];
  },
  async restore(rows) {
    const incoming = rows.find((r): r is Row => isRow(r) && typeof r.label === 'string' && Array.isArray(r.rows));
    const skipped = rows.length - (incoming ? 1 : 0);
    // One slot: the dictionary on this device is the reader's current one, so it is never replaced by an import.
    if (!incoming || (await loadPersonalDictionary())) return { written: 0, kept: incoming ? 1 : 0, skipped };
    await savePersonalDictionary(incoming.label as string, incoming.rows as never);
    try {
      // Loaded on demand: the provider pulls in the AraMorph worker, which an export has no other need of.
      (await import('../dictionary/providers/personal/PersonalDictionaryProvider')).personalDictionaryProvider.refresh();
    } catch {
      // No provider to tell (a test, or a build without workers): it reads the stored dictionary when first used.
    }
    return { written: 1, kept: 0, skipped };
  },
};

/** Study desk tables (src/studyDesk): newer-wins by updatedAt, like the main tables. */
function deskTable(table: 'items' | 'desks'): RecordStore {
  return {
    id: `${DESK_DB}/${table}`,
    read: () => (table === 'items' ? deskStore.readAllItems() : deskStore.readAllDesks()),
    async restore(rows) {
      const { toWrite, result } = await newerThanLocal(rows, 'id', 'updatedAt', (keys) => deskStore.bulkGet(table, keys));
      await deskStore.bulkPut(table, toWrite);
      return result;
    },
  };
}

function storeFor(spec: StoreSpec): RecordStore | undefined {
  if (spec.db === MAIN_DB) {
    if (isSyncedTable(spec.id)) return syncedStore(spec.id);
    if (spec.id === 'wordInstances') return wordInstances;
    if (spec.id === 'sensePicks') return sensePicks;
    return undefined;
  }
  if (spec.id === `${DESK_DB}/items`) return deskTable('items');
  if (spec.id === `${DESK_DB}/desks`) return deskTable('desks');
  return spec.id === personalDictionary.id ? personalDictionary : undefined;
}

/** Registry ids that are exported as original files (book files), not as JSON rows: see exportAll.ts. */
export const FILE_STORE_IDS: readonly string[] = ['bookFiles', 'blob:book'];

/** Every store the registry marks as exported as JSON, in registry order. */
export const JSON_SPECS = STORAGE_REGISTRY.filter((s) => s.kind === 'table' && s.exportFormat === 'json');

/** Their readers and restorers. The registry test fails if a JSON store has none. */
export const RECORD_STORES: RecordStore[] = JSON_SPECS.flatMap((s) => storeFor(s) ?? []);
