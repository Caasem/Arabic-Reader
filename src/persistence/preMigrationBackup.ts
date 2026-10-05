import Dexie from 'dexie';

/**
 * Verified backup taken before the database is upgraded to schema v10
 * (docs/specs/storage-and-sync.md, section 3). This runs *before* the main
 * Dexie instance opens, because an upgrade transaction cannot contain it.
 *
 * Order: dump every user table at the old version, write it out, read it back,
 * and check a SHA-256 digest of each table (not just row counts). Only then
 * may the upgrade run.
 */

export const DB_NAME = 'arabic-reader';
export const TARGET_VERSION = 10;

/** Large, replaceable, or derived data that stays out of the backup. */
const EXCLUDED_TABLES = new Set(['bookFiles', 'bookLocations']);

export interface PreMigrationBackup {
  formatVersion: 1;
  createdAt: number;
  fromVersion: number;
  tables: Record<string, unknown[]>;
  /** SHA-256 (hex) of each table's canonical serialisation. */
  digests: Record<string, string>;
}

export class BackupVerificationError extends Error {}
export class MigrationBlockedError extends Error {}

/** Where the backup goes. `file` is a real safety net; `convenience` lives in browser storage that can be cleared. */
export interface BackupSink {
  kind: 'file' | 'convenience';
  save(filename: string, text: string): Promise<void>;
  /** Re-read what was written, where the platform allows it. */
  readBack?(filename: string): Promise<string>;
}

export type MigrationBackupOutcome =
  | { status: 'not-needed' }
  | { status: 'backed-up'; filename: string; verifiedReadBack: boolean }
  | { status: 'convenience-only'; filename: string }
  | { status: 'skipped'; reason: string };

// -- canonical serialisation and digest ---------------------------------------

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalise(v)]),
    );
  }
  return value;
}

export async function digestTable(rows: unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalise(rows)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// -- reading the old database -------------------------------------------------

/**
 * Every user table at the version the database currently has, or null when
 * there is nothing to protect (no database, already upgraded, or all empty).
 * Opens with no declared schema, so it never triggers an upgrade.
 */
export async function readLegacyDump(): Promise<{ fromVersion: number; tables: Record<string, unknown[]> } | null> {
  if (!(await Dexie.exists(DB_NAME))) return null;
  const legacy = new Dexie(DB_NAME);
  try {
    await legacy.open();
    if (legacy.verno >= TARGET_VERSION) return null;
    const tables: Record<string, unknown[]> = {};
    for (const table of legacy.tables) {
      if (!EXCLUDED_TABLES.has(table.name)) tables[table.name] = await table.toArray();
    }
    const total = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
    return total === 0 ? null : { fromVersion: legacy.verno, tables };
  } finally {
    legacy.close();
  }
}

// -- building and verifying ---------------------------------------------------

export async function buildBackup(
  dump: { fromVersion: number; tables: Record<string, unknown[]> },
  now: number,
): Promise<PreMigrationBackup> {
  const digests: Record<string, string> = {};
  for (const [name, rows] of Object.entries(dump.tables)) digests[name] = await digestTable(rows);
  return { formatVersion: 1, createdAt: now, fromVersion: dump.fromVersion, tables: dump.tables, digests };
}

/** Parse backup text back and recompute every digest. Throws if anything differs. */
export async function verifyBackupText(text: string, expected: PreMigrationBackup): Promise<void> {
  let parsed: PreMigrationBackup;
  try {
    parsed = JSON.parse(text) as PreMigrationBackup;
  } catch {
    throw new BackupVerificationError('The backup file could not be read back.');
  }
  const names = Object.keys(expected.digests);
  if (Object.keys(parsed.tables ?? {}).length !== names.length) {
    throw new BackupVerificationError('The backup file is missing tables.');
  }
  for (const name of names) {
    const rows = parsed.tables[name];
    if (!Array.isArray(rows) || rows.length !== expected.tables[name].length) {
      throw new BackupVerificationError(`Row count mismatch in "${name}".`);
    }
    if ((await digestTable(rows)) !== expected.digests[name]) {
      throw new BackupVerificationError(`Contents of "${name}" differ from the original.`);
    }
  }
}

export const backupFilename = (createdAt: number): string =>
  `arabic-reader-premigration-${new Date(createdAt).toISOString().replace(/[:.]/g, '-')}.json`;

// -- policy -------------------------------------------------------------------

export interface EnsureBackupOptions {
  sink: BackupSink;
  now?: number;
  /** Called after the file is written; return false if the user did not save it. */
  confirmSaved?: (filename: string) => Promise<boolean>;
  /** Last resort when the backup cannot be made. Return true to continue without one. */
  confirmWithoutBackup?: (reason: string) => Promise<boolean>;
}

/**
 * Make and verify the backup, or decide that migrating without one is
 * explicitly allowed. Throws MigrationBlockedError when the upgrade must not run.
 */
export async function ensureBackupBeforeMigration(options: EnsureBackupOptions): Promise<MigrationBackupOutcome> {
  const dump = await readLegacyDump();
  if (!dump) return { status: 'not-needed' };

  const now = options.now ?? Date.now();
  const filename = backupFilename(now);
  try {
    const backup = await buildBackup(dump, now);
    const text = JSON.stringify(backup);
    await verifyBackupText(text, backup); // our own serialisation round-trips
    await options.sink.save(filename, text);
    if (options.sink.readBack) await verifyBackupText(await options.sink.readBack(filename), backup);
    if (options.confirmSaved && !(await options.confirmSaved(filename))) {
      throw new BackupVerificationError('The backup was not saved.');
    }
    if (options.sink.kind === 'convenience') return { status: 'convenience-only', filename };
    return { status: 'backed-up', filename, verifiedReadBack: Boolean(options.sink.readBack) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (options.confirmWithoutBackup && (await options.confirmWithoutBackup(reason))) {
      return { status: 'skipped', reason };
    }
    throw new MigrationBlockedError(`The data upgrade was stopped because a backup could not be made: ${reason}`);
  }
}
