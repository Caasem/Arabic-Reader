/**
 * The wire protocol and every limit of the crowd ranking service. Section numbers refer to
 * docs/specs/crowd-sense-ranking.md. This file has no I/O so the app and the server can share its shapes.
 */

export const LIMITS = {
  maxBodyBytes: 8 * 1024,
  maxItems: 50,
  /** `sentAt` must be within this of the server clock (section 11). */
  sentAtWindowMs: 10 * 60 * 1000,
  /** An item older than this many days is `too_old` (section 7.4: 14 days plus one day of slack). */
  maxAgeDays: 15,
  /** An item may exceed the install's highest applied rev by at most this (section 7.4). */
  revWindow: 10_000,
  nonceTtlMs: 30 * 60 * 1000,
  tombstoneDays: 30,
  deletionLedgerDays: 35,
  installExpiryDays: 365,
  snapshotDays: 30,
  /** Requests per install per hour, per address per hour, and new installs per address per day. */
  perInstallPerHour: 120,
  perAddressPerHour: 600,
  registrationsPerAddressPerDay: 20,
  /** Manifest lifetime (section 9.4). The app adds its own 14-day grace. */
  manifestTtlDays: 7,
} as const;

/** Server-side thresholds, also written into every manifest so they can change without an app update (8.3). */
export interface Thresholds {
  minPicks: number;
  minInstalls: number;
  minShare: number;
  minLead: number;
  minBookContributors: number;
  /** Smoothing weight for the per-book ranking (8.2). */
  smoothingK: number;
  /** Fraction taken off a vote that was saved from the first position shown (8.2, position bias). */
  firstPositionDiscount: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minPicks: 30,
  minInstalls: 10,
  minShare: 0.4,
  minLead: 0.1,
  minBookContributors: 20,
  smoothingK: 20,
  firstPositionDiscount: 0.25,
};

export type VoteSource = 'entry' | 'selection' | 'edit';
export type VoteAction = 'save' | 'unsave';

export interface VoteItem {
  bookKey: string;
  lemmaKey: string;
  providerId: string;
  entryKey: string;
  senseKey?: string | null;
  source: VoteSource;
  pos: number;
  rev: number;
  action: VoteAction;
  day: string;
  form?: string;
}

export interface VotesRequest {
  installId: string;
  publicKey?: string;
  nonce: string;
  seq: number;
  sentAt: string;
  appVersion: string;
  items: VoteItem[];
  sig: string;
}

export interface DeleteRequest {
  installId: string;
  nonce: string;
  sentAt: string;
  /** Either an Ed25519 signature from the install key (`sig`) or an HMAC with the recovery secret (`proof`). */
  sig?: string;
  proof?: string;
}

export type ItemCode = 'rev_too_far' | 'too_old' | 'unknown_entry' | 'unknown_sense' | 'bad_item' | 'deny_listed';
export type ItemResult = { status: 'applied' } | { status: 'stale' } | { status: 'rejected'; code: ItemCode };

export interface VotesResponse {
  results: ItemResult[];
  maxRev: number;
  /** Only on the request that registers the install; shown to the reader once. */
  recoveryCode?: string;
}

export type RequestErrorCode =
  | 'too_large'
  | 'bad_json'
  | 'bad_schema'
  | 'bad_signature'
  | 'bad_time'
  | 'replayed'
  | 'rate_limited'
  | 'banned'
  | 'install_deleted'
  | 'unknown_install'
  | 'bad_install_id'
  | 'disabled'
  | 'unauthorized';

export interface ErrorBody {
  error: RequestErrorCode;
}

const KEY = /^[a-z2-7]{10,32}$/;
const PROVIDER = /^[a-z0-9][a-z0-9-]{1,23}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const B64URL = /^[A-Za-z0-9_-]{8,200}$/;
const SOURCES: readonly string[] = ['entry', 'selection', 'edit'];
const ACTIONS: readonly string[] = ['save', 'unsave'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Strict check of one vote. Returns null when it is not well formed. */
export function parseItem(v: unknown): VoteItem | null {
  if (!isObject(v)) return null;
  const { bookKey, lemmaKey, providerId, entryKey, senseKey, source, pos, rev, action, day, form } = v;
  if (typeof bookKey !== 'string' || !KEY.test(bookKey)) return null;
  if (typeof lemmaKey !== 'string' || !KEY.test(lemmaKey)) return null;
  if (typeof providerId !== 'string' || !PROVIDER.test(providerId)) return null;
  if (typeof entryKey !== 'string' || !KEY.test(entryKey)) return null;
  if (senseKey !== undefined && senseKey !== null && (typeof senseKey !== 'string' || !KEY.test(senseKey))) return null;
  if (typeof source !== 'string' || !SOURCES.includes(source)) return null;
  if (!isInt(pos, 0, 200) || !isInt(rev, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof action !== 'string' || !ACTIONS.includes(action)) return null;
  if (typeof day !== 'string' || !DAY.test(day) || Number.isNaN(Date.parse(day + 'T00:00:00Z'))) return null;
  if (form !== undefined && (typeof form !== 'string' || form.length > 12)) return null;
  return {
    bookKey,
    lemmaKey,
    providerId,
    entryKey,
    senseKey: senseKey ?? null,
    source: source as VoteSource,
    pos,
    rev,
    action: action as VoteAction,
    day,
    ...(form ? { form } : {}),
  };
}

/** Strict check of a votes request. Returns null on any malformed field. */
export function parseVotesRequest(v: unknown): VotesRequest | null {
  if (!isObject(v)) return null;
  const { installId, publicKey, nonce, seq, sentAt, appVersion, items, sig } = v;
  if (typeof installId !== 'string' || !KEY.test(installId)) return null;
  if (publicKey !== undefined && (typeof publicKey !== 'string' || !B64URL.test(publicKey))) return null;
  if (typeof nonce !== 'string' || !B64URL.test(nonce)) return null;
  if (!isInt(seq, 0, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof sentAt !== 'string' || Number.isNaN(Date.parse(sentAt))) return null;
  if (typeof appVersion !== 'string' || appVersion.length > 24) return null;
  if (!Array.isArray(items) || items.length > LIMITS.maxItems) return null;
  if (typeof sig !== 'string' || sig.length > 200) return null;
  const parsed: VoteItem[] = [];
  for (const item of items) {
    const p = parseItem(item);
    if (!p) return null;
    parsed.push(p);
  }
  return { installId, ...(publicKey ? { publicKey } : {}), nonce, seq, sentAt, appVersion, items: parsed, sig };
}

export function parseDeleteRequest(v: unknown): DeleteRequest | null {
  if (!isObject(v)) return null;
  const { installId, nonce, sentAt, sig, proof } = v;
  if (typeof installId !== 'string' || !KEY.test(installId)) return null;
  if (typeof nonce !== 'string' || !B64URL.test(nonce)) return null;
  if (typeof sentAt !== 'string' || Number.isNaN(Date.parse(sentAt))) return null;
  if ((sig === undefined) === (proof === undefined)) return null; // exactly one of them
  if (sig !== undefined && (typeof sig !== 'string' || sig.length > 200)) return null;
  if (proof !== undefined && (typeof proof !== 'string' || proof.length > 200)) return null;
  return { installId, nonce, sentAt, ...(sig !== undefined ? { sig } : {}), ...(proof !== undefined ? { proof } : {}) };
}

/** JSON with sorted keys and no whitespace, so both sides sign the same bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
}

/** What a request signature covers: everything except the signature itself. */
export function signedPayload(req: VotesRequest | DeleteRequest): string {
  const { sig: _sig, proof: _proof, ...rest } = req as VotesRequest & DeleteRequest;
  return canonicalJson(rest);
}

/** UTC date `YYYY-MM-DD` for a time in milliseconds. */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const dayToMs = (day: string): number => Date.parse(day + 'T00:00:00Z');

/**
 * 0..99, from the install id. Installs below the hold-out percentage always see dictionary order, so their
 * saves are free of position bias and calibrate the rest (section 8.2). The app and the server both use this.
 */
export function holdoutBucket(installId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < installId.length; i++) {
    h ^= installId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}
