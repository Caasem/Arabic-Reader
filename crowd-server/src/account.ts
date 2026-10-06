import { fromBase64url, hmacSha256, sha256Hex, utf8, verifyEd25519 } from './crypto';
import { fail, type IngestDeps, type Reply } from './ingest';
import { LIMITS, signedPayload, utcDay } from './protocol';

/**
 * Optional sign in with Apple (docs/specs/crowd-sense-ranking.md, section 8.7). A signed-in reader counts once across
 * their devices and with a higher base weight. The server keeps only a one-way hash of Apple's user id, never the
 * email. Nothing here runs unless the Worker is given an audience and a server secret.
 */
export interface AppleConfig {
  /** The app or services id the identity token must be issued for. */
  audience: string;
  /** Secret for the account hash (an HMAC key). */
  serverSecret: Uint8Array;
  /** Apple's public signing keys. The Worker fetches and caches them; tests pass their own. */
  jwks(): Promise<JsonWebKey[]>;
}

const ISSUER = 'https://appleid.apple.com';

interface TokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nonce?: string;
}

const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(fromBase64url(part))) as T;

/** Checks an Apple identity token: signature, issuer, audience, expiry and that it was minted for this request. */
export async function verifyIdentityToken(token: string, nonce: string, cfg: AppleConfig, now: number): Promise<{ sub: string } | null> {
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const header = decodeJson<{ alg?: string; kid?: string }>(h);
    if (header.alg !== 'RS256') return null;
    const jwk = (await cfg.jwks()).find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(s), utf8(`${h}.${p}`)))) return null;
    const claims = decodeJson<TokenClaims>(p);
    if (claims.iss !== ISSUER || claims.aud !== cfg.audience || !claims.sub || typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    // Apple returns the nonce as given, or as its SHA-256 in hex, depending on the platform.
    if (claims.nonce !== nonce && claims.nonce !== (await sha256Hex(nonce))) return null;
    return { sub: claims.sub };
  } catch {
    return null;
  }
}

export const accountIdFor = async (cfg: AppleConfig, sub: string): Promise<string> => hmacSha256(cfg.serverSecret, 'apple|' + sub);

interface InstallKey {
  installId: string;
  publicKey: string;
  accountId: string | null;
}

async function authenticate(deps: IngestDeps, rawBody: string, fields: string[]): Promise<{ body: Record<string, string>; install: InstallKey } | Reply> {
  const { db } = deps;
  const now = deps.now();
  if (new TextEncoder().encode(rawBody).length > LIMITS.maxBodyBytes * 2) return fail('too_large');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return fail('bad_json');
  }
  for (const f of [...fields, 'installId', 'nonce', 'sentAt', 'sig']) if (typeof body[f] !== 'string') return fail('bad_schema');
  const b = body as Record<string, string>;
  if (Math.abs(Date.parse(b.sentAt) - now) > LIMITS.sentAtWindowMs) return fail('bad_time');
  const install = await db.get<InstallKey>(`SELECT installId, publicKey, accountId FROM installs WHERE installId = ?`, [b.installId]);
  if (!install) return fail('unknown_install');
  const { sig, ...rest } = b;
  if (!(await verifyEd25519(fromBase64url(install.publicKey), sig, signedPayload(rest as never)))) return fail('bad_signature');
  const seen = await db.get(`SELECT 1 AS x FROM nonces WHERE nonce = ? AND expiresAt > ?`, [b.nonce, now]);
  if (seen) return fail('replayed');
  await db.run(`INSERT INTO nonces (nonce, expiresAt) VALUES (?, ?) ON CONFLICT(nonce) DO UPDATE SET expiresAt = excluded.expiresAt`, [b.nonce, now + LIMITS.nonceTtlMs]);
  return { body: b, install };
}

const isReply = (v: unknown): v is Reply => typeof (v as Reply).status === 'number';

/** POST /v1/account/link: bind this install to a signed-in Apple account (section 8.7, step 4). */
export async function handleLink(deps: IngestDeps, cfg: AppleConfig, rawBody: string): Promise<Reply> {
  const auth = await authenticate(deps, rawBody, ['identityToken']);
  if (isReply(auth)) return auth;
  const claims = await verifyIdentityToken(auth.body.identityToken, auth.body.nonce, cfg, deps.now());
  if (!claims) return fail('unauthorized');
  const accountId = await accountIdFor(cfg, claims.sub);
  await deps.db.run(`UPDATE installs SET accountId = ?, tier = CASE WHEN tier < 1 THEN 1 ELSE tier END WHERE installId = ?`, [accountId, auth.install.installId]);
  return { status: 204 };
}

/** POST /v1/account/unlink: the install goes back to anonymous weight (a curator keeps their tier). */
export async function handleUnlink(deps: IngestDeps, rawBody: string): Promise<Reply> {
  const auth = await authenticate(deps, rawBody, []);
  if (isReply(auth)) return auth;
  await deps.db.run(`UPDATE installs SET accountId = NULL, tier = CASE WHEN tier = 1 THEN 0 ELSE tier END WHERE installId = ?`, [auth.install.installId]);
  return { status: 204 };
}

/**
 * POST /v1/account/delete: removes every vote of every install linked to this account, including installs whose key
 * was lost. Any one linked install proves ownership by signing the request (section 12.1).
 */
export async function handleAccountDelete(deps: IngestDeps, rawBody: string): Promise<Reply> {
  const auth = await authenticate(deps, rawBody, []);
  if (isReply(auth)) return auth;
  const account = auth.install.accountId;
  if (!account) return { status: 204 };
  const linked = await deps.db.all<{ installId: string }>(`SELECT installId FROM installs WHERE accountId = ?`, [account]);
  const day = utcDay(deps.now());
  for (const { installId } of linked) {
    await deps.db.batch([
      { sql: `DELETE FROM votes WHERE installId = ?`, params: [installId] },
      { sql: `DELETE FROM installs WHERE installId = ?`, params: [installId] },
      { sql: `INSERT INTO deletions (installId, deletedAt) VALUES (?, ?) ON CONFLICT(installId) DO NOTHING`, params: [installId, day] },
    ]);
  }
  return { status: 204 };
}

/** Apple's keys, fetched once an hour at most. */
export function cachedAppleJwks(fetchImpl: typeof fetch = fetch): () => Promise<JsonWebKey[]> {
  let cache: { at: number; keys: JsonWebKey[] } | undefined;
  return async () => {
    if (cache && Date.now() - cache.at < 3_600_000) return cache.keys;
    const res = await fetchImpl('https://appleid.apple.com/auth/keys');
    const keys = ((await res.json()) as { keys: JsonWebKey[] }).keys;
    cache = { at: Date.now(), keys };
    return keys;
  };
}
