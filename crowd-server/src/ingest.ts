import type { Db, Statement } from './db';
import { getConfig } from './config';
import {
  base32,
  constantTimeEqual,
  fromBase64url,
  base64url,
  hmacSha256,
  installIdFromPublicKey,
  randomBytes,
  recoveryVerifier,
  verifyEd25519,
} from './crypto';
import {
  LIMITS,
  dayToMs,
  parseDeleteRequest,
  parseVotesRequest,
  signedPayload,
  utcDay,
  type ErrorBody,
  type ItemResult,
  type RequestErrorCode,
  type VoteItem,
  type VotesResponse,
} from './protocol';

/** Which entries a vote may name (section 11.1). Anything else is `unknown_entry`. */
export interface AllowList {
  allowed(providerId: string, entryKey: string, senseKey: string | null): boolean;
}

/** Accepts any entry of a known dictionary. A `SetAllowList` is stricter once the dictionary data is listed. */
export class ProviderAllowList implements AllowList {
  constructor(private readonly providers: readonly string[]) {}
  allowed(providerId: string): boolean {
    return this.providers.includes(providerId);
  }
}

/** Accepts only `(providerId, entryKey)` pairs built from the shipped dictionary data, and `(entryKey, senseKey)` pairs when given. */
export class SetAllowList implements AllowList {
  private readonly entries: Set<string>;
  private readonly senses: Set<string> | null;
  constructor(entries: Iterable<string>, senses?: Iterable<string>) {
    this.entries = new Set(entries);
    this.senses = senses ? new Set(senses) : null;
  }
  allowed(providerId: string, entryKey: string, senseKey: string | null): boolean {
    if (!this.entries.has(`${providerId}:${entryKey}`)) return false;
    return !senseKey || !this.senses || this.senses.has(`${entryKey}:${senseKey}`);
  }
}

export interface IngestDeps {
  db: Db;
  now(): number;
  /** The network address of the request, used for rate limits only and never stored beside a vote. */
  ip: string;
  allowList?: AllowList;
}

export interface Reply {
  status: number;
  body?: VotesResponse | ErrorBody;
}

const STATUS: Record<RequestErrorCode, number> = {
  too_large: 413,
  bad_json: 400,
  bad_schema: 400,
  bad_signature: 401,
  bad_time: 400,
  replayed: 409,
  rate_limited: 429,
  banned: 403,
  install_deleted: 403,
  unknown_install: 404,
  bad_install_id: 400,
  disabled: 503,
  unauthorized: 401,
};

export const fail = (error: RequestErrorCode): Reply => ({ status: STATUS[error], body: { error } });

interface InstallRow {
  installId: string;
  publicKey: string;
  recoveryVerifier: string;
  firstSeenDay: string;
  lastSeenDay: string;
  banned: number;
  maxRev: number;
}

async function rateAllowed(db: Db, key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  const start = Math.floor(now / windowMs) * windowMs;
  await db.run(`INSERT INTO rate (key, windowStart, n) VALUES (?, ?, 1) ON CONFLICT(key, windowStart) DO UPDATE SET n = n + 1`, [key, start]);
  const row = await db.get<{ n: number }>(`SELECT n FROM rate WHERE key = ? AND windowStart = ?`, [key, start]);
  return (row?.n ?? 0) <= limit;
}

/** Records a nonce; false when it was already seen (a replay). */
async function takeNonce(db: Db, nonce: string, now: number): Promise<boolean> {
  const seen = await db.get(`SELECT 1 AS x FROM nonces WHERE nonce = ? AND expiresAt > ?`, [nonce, now]);
  if (seen) return false;
  await db.run(`INSERT INTO nonces (nonce, expiresAt) VALUES (?, ?) ON CONFLICT(nonce) DO UPDATE SET expiresAt = excluded.expiresAt`, [nonce, now + LIMITS.nonceTtlMs]);
  return true;
}

const timeOk = (sentAt: string, now: number): boolean => Math.abs(Date.parse(sentAt) - now) <= LIMITS.sentAtWindowMs;

const voteKey = (installId: string, i: VoteItem): string => [installId, i.bookKey, i.lemmaKey, i.providerId, i.entryKey].join('|');

const UPSERT = `INSERT INTO votes (installId, bookKey, lemmaKey, providerId, entryKey, senseKey, source, pos, saved, rev, form, day, appliedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(installId, bookKey, lemmaKey, providerId, entryKey) DO UPDATE SET
  senseKey = excluded.senseKey, source = excluded.source, pos = excluded.pos, saved = excluded.saved,
  rev = excluded.rev, form = excluded.form, day = excluded.day, appliedAt = excluded.appliedAt
WHERE excluded.rev > votes.rev`;

/** POST /v1/votes (section 11). */
export async function handleVotes(deps: IngestDeps, rawBody: string): Promise<Reply> {
  const { db } = deps;
  const now = deps.now();
  if (new TextEncoder().encode(rawBody).length > LIMITS.maxBodyBytes) return fail('too_large');
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return fail('bad_json');
  }
  const req = parseVotesRequest(json);
  if (!req) return fail('bad_schema');

  const config = await getConfig(db);
  if (!config.enabled) return fail('disabled');

  // A deleted ID is never used again while its ledger row exists (section 12.1).
  if (await db.get(`SELECT 1 AS x FROM deletions WHERE installId = ?`, [req.installId])) return fail('install_deleted');

  const install = await db.get<InstallRow>(`SELECT installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay, banned, maxRev FROM installs WHERE installId = ?`, [req.installId]);
  let publicKeyB64 = install?.publicKey;
  if (!install) {
    if (!req.publicKey) return fail('unknown_install');
    publicKeyB64 = req.publicKey;
  }
  const publicKey = fromBase64url(publicKeyB64!);
  if (!install && (await installIdFromPublicKey(publicKey)) !== req.installId) return fail('bad_install_id');

  if (!(await verifyEd25519(publicKey, req.sig, signedPayload(req)))) return fail('bad_signature');
  if (!timeOk(req.sentAt, now)) return fail('bad_time');
  if (!(await takeNonce(db, req.nonce, now))) return fail('replayed');

  if (!(await rateAllowed(db, 'i:' + req.installId, LIMITS.perInstallPerHour, 3_600_000, now))) return fail('rate_limited');
  if (!(await rateAllowed(db, 'a:' + deps.ip, LIMITS.perAddressPerHour, 3_600_000, now))) return fail('rate_limited');
  if (install?.banned) return fail('banned');

  const today = utcDay(now);
  const statements: Statement[] = [];
  let recoveryCode: string | undefined;
  let maxRev = install?.maxRev ?? 0;
  const startRev = maxRev;

  if (!install) {
    if (!(await rateAllowed(db, 'r:' + deps.ip, LIMITS.registrationsPerAddressPerDay, 86_400_000, now))) return fail('rate_limited');
    recoveryCode = base32(randomBytes(16));
    statements.push({
      sql: `INSERT INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay) VALUES (?, ?, ?, ?, ?)`,
      params: [req.installId, req.publicKey, base64url(await recoveryVerifier(recoveryCode)), today, today],
    });
  }

  const allow = deps.allowList ?? new ProviderAllowList(config.providers);
  const results: ItemResult[] = new Array(req.items.length);
  const stored = new Map<string, number | undefined>();
  const todayMs = dayToMs(today);

  // Oldest revision first, so the newest of two changes to the same vote in one request wins (section 7.4).
  const order = req.items.map((item, i) => ({ item, i })).sort((a, b) => a.item.rev - b.item.rev || a.i - b.i);
  for (const { item, i } of order) {
    const dayMs = dayToMs(item.day);
    if (dayMs > todayMs) {
      results[i] = { status: 'rejected', code: 'bad_item' };
      continue;
    }
    if ((todayMs - dayMs) / 86_400_000 > LIMITS.maxAgeDays) {
      results[i] = { status: 'rejected', code: 'too_old' };
      continue;
    }
    if (!allow.allowed(item.providerId, item.entryKey, item.senseKey ?? null)) {
      results[i] = { status: 'rejected', code: item.senseKey ? 'unknown_sense' : 'unknown_entry' };
      continue;
    }
    if (item.rev > startRev + LIMITS.revWindow) {
      results[i] = { status: 'rejected', code: 'rev_too_far' };
      continue;
    }
    const key = voteKey(req.installId, item);
    if (!stored.has(key)) {
      const row = await db.get<{ rev: number }>(
        `SELECT rev FROM votes WHERE installId = ? AND bookKey = ? AND lemmaKey = ? AND providerId = ? AND entryKey = ?`,
        [req.installId, item.bookKey, item.lemmaKey, item.providerId, item.entryKey],
      );
      stored.set(key, row?.rev);
    }
    const have = stored.get(key);
    if (have !== undefined && item.rev <= have) {
      results[i] = { status: 'stale' };
      continue;
    }
    stored.set(key, item.rev);
    maxRev = Math.max(maxRev, item.rev);
    results[i] = { status: 'applied' };
    statements.push({
      sql: UPSERT,
      params: [req.installId, item.bookKey, item.lemmaKey, item.providerId, item.entryKey, item.senseKey ?? null, item.source, item.pos, item.action === 'save' ? 1 : 0, item.rev, item.form ?? null, item.day, now],
    });
  }

  statements.push({ sql: `UPDATE installs SET maxRev = ?, lastSeenDay = ? WHERE installId = ?`, params: [maxRev, today, req.installId] });
  await db.batch(statements);

  return { status: 200, body: { results, maxRev, ...(recoveryCode ? { recoveryCode } : {}) } };
}

/** POST /v1/delete (section 11, 12.1). Authenticated by the install key or by the recovery secret. */
export async function handleDelete(deps: IngestDeps, rawBody: string): Promise<Reply> {
  const { db } = deps;
  const now = deps.now();
  if (new TextEncoder().encode(rawBody).length > LIMITS.maxBodyBytes) return fail('too_large');
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return fail('bad_json');
  }
  const req = parseDeleteRequest(json);
  if (!req) return fail('bad_schema');
  if (!timeOk(req.sentAt, now)) return fail('bad_time');
  if (!(await rateAllowed(db, 'a:' + deps.ip, LIMITS.perAddressPerHour, 3_600_000, now))) return fail('rate_limited');

  const install = await db.get<InstallRow>(`SELECT installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay, banned, maxRev FROM installs WHERE installId = ?`, [req.installId]);
  // Deleting something that is already gone is a success, so a retry is harmless.
  if (!install) return { status: 204 };

  const payload = signedPayload(req);
  let ok = false;
  if (req.sig) ok = await verifyEd25519(fromBase64url(install.publicKey), req.sig, payload);
  else if (req.proof) ok = constantTimeEqual(await hmacSha256(fromBase64url(install.recoveryVerifier), payload), req.proof);
  if (!ok) return fail('bad_signature');
  if (!(await takeNonce(db, req.nonce, now))) return fail('replayed');

  await db.batch([
    { sql: `DELETE FROM votes WHERE installId = ?`, params: [req.installId] },
    { sql: `DELETE FROM installs WHERE installId = ?`, params: [req.installId] },
    { sql: `INSERT INTO deletions (installId, deletedAt) VALUES (?, ?) ON CONFLICT(installId) DO NOTHING`, params: [req.installId, utcDay(now)] },
  ]);
  return { status: 204 };
}
