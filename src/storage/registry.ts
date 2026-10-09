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
export const BLOBS_DB = 'arabic-reader-blobs';
export const DESK_DB = 'arabic-reader-desk';
export const INK_DB = 'arabic-reader-ink';

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
  table(MAIN_DB, 'bookFiles', { ...userFile, note: 'Legacy: book files move to the BlobStore (namespace "book") after the v13 upgrade; kept declared, empty once migrated, for one release.' }),
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
  table(MAIN_DB, 'packs', { cls: 'L', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'none', note: 'Installed data packs (src/packManager). Local only; each device downloads its own. Authoritative for what is installed, so never evicted: the bytes are class C and are removed through uninstall.' }),
  table(MAIN_DB, 'packMeta', { cls: 'L', syncs: false, inBackup: false, evictable: false, merge: 'none', exportFormat: 'none', note: 'The last verified pack manifest; its sequence is what refuses a rollback.' }),
  table(MAIN_DB, 'packParts', { ...cache, note: 'Ranges of a pack file mid-download, so an interrupted download resumes. Safe to clear.' }),
  table(MAIN_DB, 'crowdPacks', { ...cache, cls: 'D', note: 'Cached, verified ranking files; downloaded again when missing.' }),

  // --- Other IndexedDB databases ----------------------------------------------
  table(FONTS_DB, 'faces', { ...userFile, exportFormat: 'none', note: 'Details of uploaded fonts; the files are in the BlobStore (namespace "font", owner = face id, fileHash). Rows from before M1d carry the file inline until loaded. Not exported: fonts are often licensed to one person (same reason they stay out of backups).' }),
  table(PERSONAL_DICTIONARY_DB, 'dictionaries', { ...userFile, exportFormat: 'json', note: 'Parsed rows of the reader\'s own dictionary; BlobStore in M1d.' }),
  table(ARAMORPH_FILES_DB, 'files', { ...userFile, exportFormat: 'none', note: 'A custom AraMorph dataset the reader uploaded; not exported, the reader still has the source files.' }),
  table(ARAMORPH_FILES_DB, 'parsedTables', { ...cache, note: 'Parsed AraMorph tables, rebuilt from the data files.' }),
  table(FREQUENCY_DB, 'meta', { ...localRecords, exportFormat: 'none', note: 'One opt-in flag for vocabulary rarity, switched on again in Settings.' }),
  table(BLOBS_DB, 'blobs', {
    ...userFile,
    exportFormat: 'none',
    note: 'BlobStore bytes (IndexedDB backend). Class, eviction and export are decided per namespace below.',
  }),
  table(DESK_DB, 'items', { ...localRecords, note: 'Study desk items (src/studyDesk): captures, concepts, margin notes. Local only until sync covers it.' }),
  table(DESK_DB, 'desks', { ...localRecords, note: 'Study desks and their documents (sanitized HTML with item embeds). Local only until sync covers it.' }),
  table(INK_DB, 'strokes', { ...localRecords, note: 'Ink written on book pages (src/annotate): PDF strokes in page units, clean-text strokes tied to a word. Local only until sync covers it.' }),
  table(INK_DB, 'sketches', { ...localRecords, note: 'Sketch sheets beside the pages (src/annotate): freehand strokes and diagram nodes per page or passage. Local only until sync covers it.' }),
  table(BLOBS_DB, 'blobIndex', { ...cache, evictable: false, note: 'BlobStore index: rebuildable by a scan, but it holds the owner references, so never evicted.' }),

  // --- BlobStore namespaces (src/blobStore) -----------------------------------
  blobNamespace('book', { ...userFile, note: 'Imported book files; owner = book id, referenced by books.fileHash.' }),
  blobNamespace('pdf', { ...userFile, exportFormat: 'none', note: 'The original PDF of a book added as PDF (Original pages view); owner = book id, referenced by books.pdf.originalHash. Not in the full export yet.' }),
  blobNamespace('font', { ...userFile, exportFormat: 'none', note: 'Uploaded font files; owner = face id. Not exported (licensed to the reader).' }),
  blobNamespace('dictionary', { ...userFile, exportFormat: 'none', note: 'The personal dictionary parsed rows as JSON; owner "personal". Exported through the personal dictionary table, not as a file.' }),
  blobNamespace('desk', { ...userFile, exportFormat: 'none', note: 'Images on the study desk (region captures of PDF pages, pasted screenshots); owner = desk item id. Not in the full export yet.' }),
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
