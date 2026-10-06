import { aggregate } from './aggregate';
import { constantTimeEqual } from './crypto';
import { getConfig, saveConfig } from './config';
import { publish, rollback, type PublishDeps } from './publish';

export interface AdminReply {
  status: number;
  json: unknown;
}

/**
 * The maintainer's endpoints (section 14), behind a bearer token. With no token configured they are off.
 * Paths are relative to `/v1/admin`.
 */
export async function handleAdmin(
  deps: PublishDeps & { adminToken?: string | undefined },
  method: string,
  path: string,
  authorization: string | null,
  rawBody: string,
): Promise<AdminReply> {
  const token = deps.adminToken;
  const given = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || token.length < 16 || !constantTimeEqual(given, token)) return { status: 401, json: { error: 'unauthorized' } };
  const { db } = deps;
  let body: Record<string, unknown> = {};
  if (method === 'POST' && rawBody) {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { status: 400, json: { error: 'bad_json' } };
    }
  }

  if (method === 'GET' && path === '/summary') {
    const one = async (sql: string) => (await db.get<{ n: number }>(sql))?.n ?? 0;
    return {
      status: 200,
      json: {
        installs: await one(`SELECT COUNT(*) AS n FROM installs`),
        banned: await one(`SELECT COUNT(*) AS n FROM installs WHERE banned = 1`),
        votes: await one(`SELECT COUNT(*) AS n FROM votes WHERE saved = 1`),
        tombstones: await one(`SELECT COUNT(*) AS n FROM votes WHERE saved = 0`),
        deletions: await one(`SELECT COUNT(*) AS n FROM deletions`),
        config: await getConfig(db),
      },
    };
  }
  if (method === 'GET' && path === '/words') {
    const { stats, summary } = await aggregate(db, deps.now(), await getConfig(db));
    return { status: 200, json: { summary, words: stats.slice(0, 500) } };
  }
  if (method === 'GET' && path === '/snapshots') {
    return { status: 200, json: await db.all(`SELECT id, createdAt, sequence FROM snapshots ORDER BY id DESC LIMIT 60`) };
  }
  if (method === 'GET' && path === '/alerts') {
    return { status: 200, json: await db.all(`SELECT id, at, kind, detail FROM alerts ORDER BY id DESC LIMIT 100`) };
  }
  if (method === 'POST' && path === '/aggregate') {
    const { sequence, snapshotId, alerts } = await publish(deps);
    return { status: 200, json: { sequence, snapshotId, alerts } };
  }
  if (method === 'POST' && path === '/rollback') {
    if (typeof body.id !== 'number') return { status: 400, json: { error: 'bad_schema' } };
    try {
      const { sequence, snapshotId, mode } = await rollback(deps, body.id);
      return { status: 200, json: { sequence, snapshotId, mode } };
    } catch {
      return { status: 404, json: { error: 'unknown_snapshot' } };
    }
  }
  if (method === 'POST' && path === '/kill') {
    if (typeof body.enabled !== 'boolean') return { status: 400, json: { error: 'bad_schema' } };
    await saveConfig(db, { enabled: body.enabled });
    // Publish at once, so the flag reaches apps in the next manifest check.
    const { sequence } = await publish(deps);
    return { status: 200, json: { enabled: body.enabled, sequence } };
  }
  if (method === 'POST' && (path === '/ban' || path === '/unban')) {
    if (typeof body.installId !== 'string') return { status: 400, json: { error: 'bad_schema' } };
    await db.run(`UPDATE installs SET banned = ? WHERE installId = ?`, [path === '/ban' ? 1 : 0, body.installId]);
    return { status: 200, json: { installId: body.installId, banned: path === '/ban' } };
  }
  if (method === 'POST' && path === '/tier') {
    if (typeof body.installId !== 'string' || typeof body.tier !== 'number' || ![0, 1, 2, 3].includes(body.tier)) return { status: 400, json: { error: 'bad_schema' } };
    await db.run(`UPDATE installs SET tier = ? WHERE installId = ?`, [body.tier, body.installId]);
    return { status: 200, json: { installId: body.installId, tier: body.tier } };
  }
  if (method === 'POST' && path === '/deny') {
    const config = await getConfig(db);
    const add = (cur: string[], more: unknown) => [...new Set([...cur, ...(Array.isArray(more) ? more.filter((x): x is string => typeof x === 'string') : [])])];
    const next = await saveConfig(db, { deny: { bookKeys: add(config.deny.bookKeys, body.bookKeys), lemmaKeys: add(config.deny.lemmaKeys, body.lemmaKeys) } });
    return { status: 200, json: next.deny };
  }
  if (method === 'POST' && path === '/thresholds') {
    const config = await getConfig(db);
    const th = { ...config.thresholds };
    for (const [k, v] of Object.entries(body)) if (k in th && typeof v === 'number') (th as unknown as Record<string, number>)[k] = v;
    return { status: 200, json: (await saveConfig(db, { thresholds: th })).thresholds };
  }
  return { status: 404, json: { error: 'not_found' } };
}
