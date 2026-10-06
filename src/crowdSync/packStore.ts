import { canonicalJson } from '../../crowd-server/src/protocol';
import { fromBase64url, sha256Hex, verifyEd25519 } from '../../crowd-server/src/crypto';
import { db } from '../persistence/schema';
import { ConsentError, crowdFetch, isSharingOn } from './consent';
import { TRUSTED_PUBLIC_KEYS } from './publicKeys';
import { loadState, updateState } from './state';
import { CLIENT_LIMITS, type CrowdStateRow, type PackRow, type StoredManifest } from './types';

declare const __APP_VERSION__: string;
const currentVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0');

export type ManifestStatus = 'off' | 'updated' | 'unchanged' | 'offline' | 'rejected';

/** `1.2.3` style comparison; anything that is not numeric counts as 0 (so a dev build passes every minimum). */
export function versionAtLeast(have: string, need: string): boolean {
  const a = have.split('.').map((n) => parseInt(n, 10) || 0);
  const b = need.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

interface RawManifest extends Omit<StoredManifest, 'etag' | 'acceptedAt'> {
  formatVersion: number;
  thresholds?: unknown;
  signature?: string;
}

async function signedByTrustedKey(m: RawManifest, keys: readonly string[]): Promise<boolean> {
  if (!m.signature) return false;
  const { signature, ...rest } = m;
  const payload = canonicalJson(rest);
  for (const key of keys) if (await verifyEd25519(fromBase64url(key), signature, payload)) return true;
  return false;
}

const isManifest = (m: unknown): m is RawManifest => {
  const x = m as RawManifest;
  return (
    typeof x === 'object' && x !== null && x.formatVersion === 1 && typeof x.sequence === 'number' && typeof x.expiresAt === 'string' && typeof x.enabled === 'boolean' &&
    typeof x.packs === 'object' && x.packs !== null && typeof x.deny === 'object' && x.deny !== null && Array.isArray(x.deny.bookKeys) && Array.isArray(x.deny.lemmaKeys)
  );
};

export interface PackDeps {
  fetchImpl?: typeof fetch;
  now?: number;
  /** Keys that may sign a manifest. Tests pass their own; the app uses the compiled-in ones. */
  keys?: readonly string[];
}

/**
 * Fetches the manifest and keeps it only if every rule holds (section 9.4): a trusted signature, a sequence that does
 * not go backwards, and an expiry that is not past the grace period. Otherwise the app keeps what it already had.
 */
export async function refreshManifest(deps: PackDeps = {}): Promise<ManifestStatus> {
  if (!isSharingOn()) return 'off';
  const now = deps.now ?? Date.now();
  const state = await loadState();
  const headers: Record<string, string> = {};
  if (state.manifest?.etag) headers['if-none-match'] = state.manifest.etag;

  let res: Response;
  try {
    res = await crowdFetch('/manifest.json', { headers }, deps.fetchImpl ?? fetch);
  } catch (e) {
    return e instanceof ConsentError ? 'off' : 'offline';
  }
  await updateState((s) => {
    s.lastManifestCheckAt = now;
  });
  if (res.status === 304) return 'unchanged';
  if (res.status !== 200) return res.status >= 500 ? 'offline' : 'rejected';

  let parsed: unknown;
  try {
    parsed = JSON.parse(await res.text());
  } catch {
    return 'rejected';
  }
  if (!isManifest(parsed)) return 'rejected';
  if (!(await signedByTrustedKey(parsed, deps.keys ?? TRUSTED_PUBLIC_KEYS))) return 'rejected';
  if (state.manifest && parsed.sequence < state.manifest.sequence) return 'rejected'; // anti-rollback
  if (now > Date.parse(parsed.expiresAt) + CLIENT_LIMITS.graceDays * 86_400_000) return 'rejected'; // already stale

  const stored: StoredManifest = {
    sequence: parsed.sequence,
    generatedAt: parsed.generatedAt,
    expiresAt: parsed.expiresAt,
    enabled: parsed.enabled,
    minAppVersion: parsed.minAppVersion ?? '0.0.0',
    holdoutPercent: typeof parsed.holdoutPercent === 'number' ? parsed.holdoutPercent : 0,
    deny: parsed.deny,
    packs: parsed.packs,
    etag: res.headers.get('etag') ?? undefined,
    acceptedAt: now,
  };
  await updateState((s) => {
    s.manifest = stored;
  });
  // Drop cached files the new manifest no longer lists or has changed.
  for (const row of await db.crowdPacks.toArray()) if (stored.packs[row.path] !== row.hash) await db.crowdPacks.delete(row.path);
  return 'updated';
}

export type RankingState = 'none' | 'disabled' | 'old-app' | 'stale' | 'ok';

/** Whether the cached manifest may be used right now: enabled, new enough app, and within expiry plus grace (9.4). */
export function rankingState(state: CrowdStateRow, now: number, appVersion = currentVersion()): RankingState {
  const m = state.manifest;
  if (!m) return 'none';
  if (!m.enabled) return 'disabled';
  if (!versionAtLeast(appVersion, m.minAppVersion)) return 'old-app';
  if (now > Date.parse(m.expiresAt) + CLIENT_LIMITS.graceDays * 86_400_000) return 'stale';
  return 'ok';
}

/** Downloads one ranking file and keeps it only if its hash is the one the signed manifest lists. */
export async function fetchPack(path: string, deps: PackDeps = {}): Promise<boolean> {
  if (!isSharingOn()) return false;
  const manifest = (await loadState()).manifest;
  const listed = manifest?.packs[path];
  if (!listed) return false;
  try {
    const res = await crowdFetch(`/packs/v1/${path}.json`, undefined, deps.fetchImpl ?? fetch);
    if (res.status !== 200) return false;
    const text = await res.text();
    if ('sha256-' + (await sha256Hex(text)) !== listed) return false;
    const row: PackRow = { path, hash: listed, text, fetchedAt: deps.now ?? Date.now() };
    await db.crowdPacks.put(row);
    return true;
  } catch {
    return false;
  }
}

export const cachedPack = async (path: string): Promise<PackRow | undefined> => db.crowdPacks.get(path);
