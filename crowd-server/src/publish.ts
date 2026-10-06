import type { Db, PackStorage } from './db';
import { aggregate, buildManifest, manifestPayload, type Manifest, type WordStat } from './aggregate';
import { getConfig, nextSequence, type ServiceConfig } from './config';
import { LIMITS, utcDay } from './protocol';

/** Signs a manifest. Backed by the private key in production; tests use a generated key. */
export interface Signer {
  sign(message: string): Promise<string>;
}

export interface PublishDeps {
  db: Db;
  storage: PackStorage;
  signer: Signer;
  now(): number;
}

export interface Published {
  sequence: number;
  snapshotId: number;
  manifest: Manifest;
  alerts: string[];
}

interface SnapshotNote {
  config: ServiceConfig;
  bannedCount: number;
  files: number;
}

const bannedCount = async (db: Db): Promise<number> => (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM installs WHERE banned = 1`))?.n ?? 0;

async function writeAll(deps: PublishDeps, manifest: Manifest, files: Record<string, string>, snapshotId: number): Promise<void> {
  const { storage } = deps;
  const manifestText = JSON.stringify(manifest);
  // Keep a private copy first (for rollback), then replace the public files, then the manifest last.
  await storage.put(`snapshots/${snapshotId}/manifest.json`, manifestText, 'application/json');
  for (const [path, text] of Object.entries(files)) await storage.put(`snapshots/${snapshotId}/${path}`, text, 'application/json');
  const live = await storage.list('packs/v1/');
  for (const path of live) if (!(path in files)) await storage.delete(path);
  for (const [path, text] of Object.entries(files)) await storage.put(path, text, 'application/json');
  await storage.put('manifest.json', manifestText, 'application/json');
}

/** Aggregates, signs and publishes a new manifest with a new, higher sequence number (sections 8.6, 9.4). */
export async function publish(deps: PublishDeps, opts: { config?: ServiceConfig; files?: Record<string, string> } = {}): Promise<Published> {
  const { db, signer } = deps;
  const now = deps.now();
  const config = opts.config ?? (await getConfig(db));
  let files = opts.files;
  let stats: WordStat[] = [];
  if (!files) {
    const result = await aggregate(db, now, config);
    files = result.files;
    stats = result.stats;
  }
  const sequence = await nextSequence(db);
  const manifest = await buildManifest(files, config, sequence, now);
  manifest.signature = await signer.sign(manifestPayload(manifest));

  const note: SnapshotNote = { config, bannedCount: await bannedCount(db), files: Object.keys(files).length };
  await db.run(`INSERT INTO snapshots (createdAt, sequence, manifestSha, note) VALUES (?, ?, ?, ?)`, [now, sequence, manifest.signature, JSON.stringify(note)]);
  const snapshotId = (await db.get<{ id: number }>(`SELECT MAX(id) AS id FROM snapshots`))!.id;
  await writeAll(deps, manifest, files, snapshotId);
  const alerts = stats.length ? await detectAlerts(db, now, stats) : [];
  return { sequence, snapshotId, manifest, alerts };
}

/**
 * Points the public files at an earlier snapshot (section 8.6). A rollback never republishes pack files older
 * than a deletion or a ban since the snapshot (section 12.1): then it aggregates again from the live votes, which
 * already leave those out, using the configuration the snapshot had. Either way the manifest gets a new, higher
 * sequence, so an old manifest can never be replayed to undo it.
 */
export async function rollback(deps: PublishDeps, snapshotId: number): Promise<Published & { mode: 'republished' | 'reaggregated' }> {
  const { db, storage } = deps;
  const snap = await db.get<{ id: number; createdAt: number; note: string }>(`SELECT id, createdAt, note FROM snapshots WHERE id = ?`, [snapshotId]);
  if (!snap) throw new Error('unknown snapshot');
  const note = JSON.parse(snap.note) as SnapshotNote;
  const day = utcDay(snap.createdAt);
  const deletedSince = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM deletions WHERE deletedAt >= ?`, [day]))?.n ?? 0;
  const banned = await bannedCount(db);
  if (deletedSince > 0 || banned !== note.bannedCount) {
    const published = await publish(deps, { config: { ...note.config, enabled: (await getConfig(db)).enabled } });
    return { ...published, mode: 'reaggregated' };
  }
  const prefix = `snapshots/${snapshotId}/`;
  const files: Record<string, string> = {};
  for (const path of await storage.list(prefix + 'packs/v1/')) files[path.slice(prefix.length)] = (await storage.get(path)) ?? '';
  const published = await publish(deps, { config: { ...note.config, enabled: (await getConfig(db)).enabled }, files });
  return { ...published, mode: 'republished' };
}

/** Alerts for the maintainer (section 14): an entry that stopped being best, a sudden jump of votes, a drop in readers. */
async function detectAlerts(db: Db, now: number, stats: WordStat[]): Promise<string[]> {
  const out: string[] = [];
  const prevRow = await db.get<{ value: string }>(`SELECT value FROM config WHERE key = 'lastBest'`);
  const prev = prevRow ? (JSON.parse(prevRow.value) as Record<string, string>) : {};
  const current: Record<string, string> = {};
  for (const s of stats) if (s.status === 'applied') current[`${s.lemmaKey}|${s.providerId}`] = s.topEntry;
  for (const [key, best] of Object.entries(prev)) if (current[key] && current[key] !== best) out.push(`best entry changed for ${key}`);

  // A word that gained far more votes in a day than is usual.
  const since = now - 86_400_000;
  const recent = await db.all<{ lemmaKey: string; providerId: string; n: number }>(
    `SELECT lemmaKey, providerId, COUNT(*) AS n FROM votes WHERE appliedAt >= ? AND saved = 1 GROUP BY lemmaKey, providerId`,
    [since],
  );
  const counts = recent.map((r) => r.n).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  for (const r of recent) if (r.n >= 20 && r.n > 5 * Math.max(1, median)) out.push(`vote spike for ${r.lemmaKey}|${r.providerId}: ${r.n} in a day`);

  const readersRow = await db.get<{ value: string }>(`SELECT value FROM config WHERE key = 'lastReaders'`);
  const readers = (await db.get<{ n: number }>(`SELECT COUNT(DISTINCT installId) AS n FROM votes WHERE saved = 1`))?.n ?? 0;
  if (readersRow && Number(readersRow.value) >= 10 && readers < 0.7 * Number(readersRow.value)) out.push(`contributors dropped from ${readersRow.value} to ${readers}`);

  for (const detail of out) await db.run(`INSERT INTO alerts (at, kind, detail) VALUES (?, ?, ?)`, [now, 'ranking', detail]);
  await db.run(`INSERT INTO config (key, value) VALUES ('lastBest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [JSON.stringify(current)]);
  await db.run(`INSERT INTO config (key, value) VALUES ('lastReaders', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(readers)]);
  return out;
}

/** Daily clean-up (sections 7.4, 12 and 14): expired nonces and counters, old tombstones, ledger rows, idle installs, old snapshots. */
export async function maintain(deps: PublishDeps): Promise<{ tombstones: number; installs: number; snapshots: number }> {
  const { db, storage } = deps;
  const now = deps.now();
  const day = (n: number) => utcDay(now - n * 86_400_000);
  await db.run(`DELETE FROM nonces WHERE expiresAt <= ?`, [now]);
  await db.run(`DELETE FROM rate WHERE windowStart < ?`, [now - 2 * 86_400_000]);
  const tombstones = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM votes WHERE saved = 0 AND appliedAt < ?`, [now - LIMITS.tombstoneDays * 86_400_000]))?.n ?? 0;
  await db.run(`DELETE FROM votes WHERE saved = 0 AND appliedAt < ?`, [now - LIMITS.tombstoneDays * 86_400_000]);
  await db.run(`DELETE FROM deletions WHERE deletedAt < ?`, [day(LIMITS.deletionLedgerDays)]);

  const idle = await db.all<{ installId: string }>(`SELECT installId FROM installs WHERE lastSeenDay < ?`, [day(LIMITS.installExpiryDays)]);
  for (const { installId } of idle) {
    await db.batch([
      { sql: `DELETE FROM votes WHERE installId = ?`, params: [installId] },
      { sql: `DELETE FROM installs WHERE installId = ?`, params: [installId] },
    ]);
  }

  const old = await db.all<{ id: number }>(`SELECT id FROM snapshots WHERE createdAt < ?`, [now - LIMITS.snapshotDays * 86_400_000]);
  for (const { id } of old) {
    for (const path of await storage.list(`snapshots/${id}/`)) await storage.delete(path);
    await db.run(`DELETE FROM snapshots WHERE id = ?`, [id]);
  }
  return { tombstones, installs: idle.length, snapshots: old.length };
}
