import type { Db } from './db';
import { DEFAULT_THRESHOLDS, type Thresholds } from './protocol';

/** Settings the maintainer can change without a deploy. Stored in the `config` table. */
export interface ServiceConfig {
  /** The kill switch (section 14). Written into every manifest as `enabled`. */
  enabled: boolean;
  /** Oldest app version that may use a ranking. */
  minAppVersion: string;
  thresholds: Thresholds;
  /** Words and books that always keep dictionary order (section 8.5). */
  deny: { bookKeys: string[]; lemmaKeys: string[] };
  /** Dictionaries a vote may name. The user's own loaded dictionaries are not shared. */
  providers: string[];
  /** Share of installs (by id) that always see dictionary order, to calibrate position bias (section 8.2). */
  holdoutPercent: number;
  /** Section 8.7: weight installs by tier. Off until sign-in exists. */
  trustTiers: boolean;
  tierBase: { anonymous: number; signed: number; established: number; curator: number };
}

export const DEFAULT_CONFIG: ServiceConfig = {
  enabled: true,
  minAppVersion: '0.0.0',
  thresholds: DEFAULT_THRESHOLDS,
  deny: { bookKeys: [], lemmaKeys: [] },
  providers: ['aramorph', 'alwasit', 'alsihah', 'almaqayis', 'baranov'],
  holdoutPercent: 10,
  trustTiers: false,
  tierBase: { anonymous: 0.3, signed: 1, established: 1.5, curator: 3 },
};

export async function getConfig(db: Db): Promise<ServiceConfig> {
  const rows = await db.all<{ key: string; value: string }>(`SELECT key, value FROM config WHERE key = 'service'`);
  if (rows.length === 0) return DEFAULT_CONFIG;
  const saved = JSON.parse(rows[0].value) as Partial<ServiceConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...saved.thresholds },
    deny: { ...DEFAULT_CONFIG.deny, ...saved.deny },
    tierBase: { ...DEFAULT_CONFIG.tierBase, ...saved.tierBase },
  };
}

export async function saveConfig(db: Db, patch: Partial<ServiceConfig>): Promise<ServiceConfig> {
  const next = { ...(await getConfig(db)), ...patch };
  await db.run(`INSERT INTO config (key, value) VALUES ('service', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [JSON.stringify(next)]);
  return next;
}

/** The manifest sequence only ever goes up (section 9.4). */
export async function nextSequence(db: Db): Promise<number> {
  const row = await db.get<{ value: string }>(`SELECT value FROM config WHERE key = 'sequence'`);
  const next = (row ? Number(row.value) : 0) + 1;
  await db.run(`INSERT INTO config (key, value) VALUES ('sequence', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(next)]);
  return next;
}
