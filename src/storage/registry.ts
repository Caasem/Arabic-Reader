/**
 * StorageRegistry (docs/specs/data-architecture.md section 5.1, ADR 0003).
 *
 * Every place the app keeps data declares itself here once: each Dexie table
 * of the main database, each table of the other IndexedDB databases the app
 * opens, and each BlobStore namespace. The declaration says which data class
 * the data belongs to, whether it moves between devices, whether it is in the
 * backup, whether it may be freed automatically under space pressure, and how
 * a full export writes it.
 *
 * registry.test.ts fails when a table or database exists that is not declared
 * here (or a declaration names one that no longer exists), and checks this
 * file against SYNCED_TABLES and the backup format. The storage screen and the
 * full export (storage-ux, M1h) are to be generated from it.
 */

/**
 * A user records, B user files, C reference packs, D aggregate (crowd) data,
 * L local-only derived data (caches, indexes: rebuildable, evicted first).
 */
export type DataClass = 'A' | 'B' | 'C' | 'D' | 'L';

export interface StoreSpec {
  /** Main-database table: its name. Other database: `<database>/<table>`. Blob namespace: `blob:<ns>`. */
  id: string;
  kind: 'table' | 'blob-namespace';
  /** IndexedDB database name (tables only). */
  db?: string;
  cls: DataClass;
  /** Moves between devices. Must match SYNCED_TABLES for the main database. */
  syncs: boolean;
  /** Included in the quick backup (src/persistence/backup.ts). */
  inBackup: boolean;
  /** May be freed automatically under space pressure (only class L and C ever are). */
  evictable: boolean;
  merge?: 'frontier' | 'union-by-id' | 'none';
  exportFormat: 'json' | 'original-file' | 'none';
  /** Why the entry is what it is, where that is not obvious. */
  note?: string;
}

export const MAIN_DB = 'arabic-reader';
export const FONTS_DB = 'arabic-reader-fonts';
export const PERSONAL_DICTIONARY_DB = 'arabic-reader-personal-dictionary';
export const ARAMORPH_FILES_DB = 'arabic-reader-aramorph-files';
export const FREQUENCY_DB = 'arabic-reader-frequency';

type TableSpec = Omit<StoreSpec, 'id' | 'kind' | 'db'>;

const syncedRecords: TableSpec = { cls: 'A', syncs: true, inBackup: false, evictable: false, merge: 'frontier', exportFormat: 'json' };
const localRecords: TableSpec = { cls: 'A', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'json' };
/** Sync bookkeeping: class A support, never synced, never exported, never evicted (it holds unpublished changes). */
const syncSupport: TableSpec = { cls: 'A', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'none' };
const cache: TableSpec = { cls: 'L', syncs: false, inBackup: false, evictable: true, merge: 'none', exportFormat: 'none' };
const userFile: TableSpec = { cls: 'B', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'original-file' };

const table = (db: string, name: string, spec: TableSpec): StoreSpec => ({
  id: db === MAIN_DB ? name : `${db}/${name}`,
  kind: 'table',
  db,
  ...spec,
});

const blobNamespace = (ns: string, spec: TableSpec): StoreSpec => ({ id: `blob:${ns}`, kind: 'blob-namespace', ...spec });

export const STORAGE_REGISTRY: readonly StoreSpec[] = [
  // --- Main database (src/persistence/schema.ts) -----------------------------
  table(MAIN_DB, 'books', syncedRecords),
  table(MAIN_DB, 'positions', syncedRecords),
  table(MAIN_DB, 'vocabulary', { ...syncedRecords, inBackup: true }),
  table(MAIN_DB, 'highlights', { ...syncedRecords, inBackup: true }),
  table(MAIN_DB, 'bookmarks', syncedRecords),
  table(MAIN_DB, 'preferences', syncedRecords),
  table(MAIN_DB, 'speedReaderPositions', syncedRecords),
  table(MAIN_DB, 'speedReaderSessions', syncedRecords),
  table(MAIN_DB, 'readingSessions', syncedRecords),
  table(MAIN_DB, 'pomodoroSessions', syncedRecords),
  table(MAIN_DB, 'bookFiles', { ...userFile, note: 'Moves to the BlobStore (namespace "book") in M1c.' }),
  table(MAIN_DB, 'bookLocations', { ...cache, note: 'epub.js locations index, rebuilt on open.' }),
  table(MAIN_DB, 'wordInstances', {
    cls: 'L',
    syncs: false,
    inBackup: true,
    evictable: false,
    merge: 'none',
    exportFormat: 'json',
    note: 'Class L in the design, but its lookup and encounter counts cannot be rebuilt from the books, so it is never evicted and is in the backup.',
  }),
  table(MAIN_DB, 'sensePicks', { ...localRecords, note: 'The reader\'s own meaning picks; local only until sync covers it.' }),
  table(MAIN_DB, 'syncMeta', syncSupport),
  table(MAIN_DB, 'syncOutbox', syncSupport),
  table(MAIN_DB, 'recordFrontier', syncSupport),
  table(MAIN_DB, 'activityLog', syncSupport),
  table(MAIN_DB, 'syncConflicts', syncSupport),
  table(MAIN_DB, 'crowdState', { cls: 'D', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'none', note: 'Crowd identity and counters; never merged into class A.' }),
  table(MAIN_DB, 'crowdQueue', { cls: 'D', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'none', note: 'Votes waiting to be sent.' }),
  table(MAIN_DB, 'crowdPacks', { ...cache, cls: 'D', note: 'Cached, verified ranking files; downloaded again when missing.' }),

  // --- Other IndexedDB databases ----------------------------------------------
  table(FONTS_DB, 'faces', { ...userFile, note: 'Uploaded fonts (src/readerFont/userFonts.ts); BlobStore namespace "font" in M1d.' }),
  table(PERSONAL_DICTIONARY_DB, 'dictionaries', { ...userFile, exportFormat: 'json', note: 'Parsed rows of the reader\'s own dictionary; BlobStore in M1d.' }),
  table(ARAMORPH_FILES_DB, 'files', { ...userFile, note: 'A custom AraMorph dataset the reader uploaded.' }),
  table(ARAMORPH_FILES_DB, 'parsedTables', { ...cache, note: 'Parsed AraMorph tables, rebuilt from the data files.' }),
  table(FREQUENCY_DB, 'meta', { ...localRecords, note: 'The reader\'s opt-in to vocabulary rarity.' }),

  // --- BlobStore namespaces (src/blobStore) -----------------------------------
  blobNamespace('book', { ...userFile, note: 'Imported book files (from M1c).' }),
  blobNamespace('font', { ...userFile, note: 'Uploaded fonts (from M1d).' }),
  blobNamespace('dictionary', { ...userFile, note: 'Personal dictionaries (from M1d).' }),
  blobNamespace('pack', { cls: 'C', syncs: false, inBackup: false, evictable: true, merge: 'none', exportFormat: 'none', note: 'Reference pack files (PackManager, M1f); downloaded again when evicted.' }),
];

const byId = new Map(STORAGE_REGISTRY.map((spec) => [spec.id, spec]));

export function storeSpec(id: string): StoreSpec | undefined {
  return byId.get(id);
}

/** The declaration for a main-database or other-database table. */
export function tableSpec(db: string, tableName: string): StoreSpec | undefined {
  return byId.get(db === MAIN_DB ? tableName : `${db}/${tableName}`);
}

/** Main-database tables that move between devices, by the registry. */
export function syncedMainTables(): string[] {
  return STORAGE_REGISTRY.filter((s) => s.kind === 'table' && s.db === MAIN_DB && s.syncs).map((s) => s.id);
}

/** The registry entry for a BlobStore namespace, or undefined when it is not declared. */
export function blobNamespaceSpec(ns: string): StoreSpec | undefined {
  return byId.get(`blob:${ns}`);
}

export function storesOfClass(cls: DataClass): StoreSpec[] {
  return STORAGE_REGISTRY.filter((s) => s.cls === cls);
}
