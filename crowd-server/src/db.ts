/**
 * Storage the service needs, as a small async interface. Cloudflare D1 and Node's built-in SQLite both
 * implement it, so every rule is written and tested once (docs/specs/crowd-sense-ranking.md, section 7).
 */
export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface Db {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Runs the statements together: all of them apply or none do. */
  batch(statements: Statement[]): Promise<void>;
}

/** One statement per entry, so a D1 `exec` can run them one at a time. Also written to `schema.sql`. */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS installs (installId TEXT PRIMARY KEY, publicKey TEXT NOT NULL, recoveryVerifier TEXT NOT NULL, firstSeenDay TEXT NOT NULL, lastSeenDay TEXT NOT NULL, weight REAL NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0, maxRev INTEGER NOT NULL DEFAULT 0, tier INTEGER NOT NULL DEFAULT 0, accountId TEXT)`,
  `CREATE TABLE IF NOT EXISTS deletions (installId TEXT PRIMARY KEY, deletedAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS votes (installId TEXT NOT NULL, bookKey TEXT NOT NULL, lemmaKey TEXT NOT NULL, providerId TEXT NOT NULL, entryKey TEXT NOT NULL, senseKey TEXT, source TEXT NOT NULL, pos INTEGER NOT NULL, saved INTEGER NOT NULL, rev INTEGER NOT NULL, form TEXT, day TEXT NOT NULL, appliedAt INTEGER NOT NULL, PRIMARY KEY (installId, bookKey, lemmaKey, providerId, entryKey))`,
  `CREATE INDEX IF NOT EXISTS votes_word ON votes (lemmaKey, providerId)`,
  `CREATE INDEX IF NOT EXISTS votes_book ON votes (bookKey)`,
  `CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate (key TEXT NOT NULL, windowStart INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (key, windowStart))`,
  `CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, createdAt INTEGER NOT NULL, sequence INTEGER NOT NULL, manifestSha TEXT NOT NULL, note TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL)`,
];

export async function migrate(db: Db): Promise<void> {
  for (const sql of SCHEMA) await db.run(sql);
}

/** Where ranking files live: Cloudflare R2 in production, memory or a folder in tests and local runs. */
export interface PackStorage {
  put(path: string, body: string, contentType?: string): Promise<void>;
  get(path: string): Promise<string | null>;
  list(prefix: string): Promise<string[]>;
  delete(path: string): Promise<void>;
}

export class MemoryStorage implements PackStorage {
  readonly files = new Map<string, string>();
  async put(path: string, body: string): Promise<void> {
    this.files.set(path, body);
  }
  async get(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}
