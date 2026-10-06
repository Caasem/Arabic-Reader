import type { VoteItem } from '../../crowd-server/src/protocol';

/**
 * Crowd ranking on the device (docs/specs/crowd-sense-ranking.md, sections 5.4, 7.4, 9 and 10). All of it is local
 * only: none of these tables is synced or put in a backup.
 */

/** The single `crowdState` row. */
export interface CrowdStateRow {
  id: 'local';
  /** The install's key pair. The private key is never exported from the device. */
  keys?: { publicKey: string; privateKey: CryptoKey };
  installId?: string;
  /** Shown once in Settings after the install registers, then cleared by the reader (section 5.4). */
  recoveryCode?: string;
  /** Whether the server has seen this install yet. Until then the public key travels with each request. */
  registered: boolean;
  /** Highest revision this device has issued (section 7.4). */
  seq: number;
  /** Highest revision the server reports it applied. */
  maxRev: number;
  /** The server banned this install; nothing more is sent. */
  blocked?: boolean;
  /** The last manifest that passed every check (section 9.4). */
  manifest?: StoredManifest;
  lastFlushAt?: number;
  lastManifestCheckAt?: number;
}

export interface StoredManifest {
  sequence: number;
  generatedAt: string;
  expiresAt: string;
  enabled: boolean;
  minAppVersion: string;
  holdoutPercent: number;
  deny: { bookKeys: string[]; lemmaKeys: string[] };
  packs: Record<string, string>;
  etag?: string;
  /** When this device accepted it, in ms. */
  acceptedAt: number;
}

/** A vote waiting to be sent. One row per vote key, so a newer change replaces an older one (section 7.4). */
export interface QueueRow {
  /** `bookKey|lemmaKey|providerId|entryKey` */
  key: string;
  rev: number;
  createdAt: number;
  item: VoteItem;
}

export interface PackRow {
  /** `book/<bookKey>` or `pooled/<shard>`, as listed in the manifest. */
  path: string;
  hash: string;
  text: string;
  fetchedAt: number;
}

export const queueKey = (i: Pick<VoteItem, 'bookKey' | 'lemmaKey' | 'providerId' | 'entryKey'>): string => `${i.bookKey}|${i.lemmaKey}|${i.providerId}|${i.entryKey}`;

/** Limits of the app side (section 10). The server enforces its own, whatever the app does. */
export const CLIENT_LIMITS = {
  queueCap: 500,
  queueMaxAgeDays: 14,
  /** How long a cached ranking is used after it expires, before the app falls back to dictionary order (section 9.4). */
  graceDays: 14,
  manifestCheckMs: 24 * 60 * 60 * 1000,
  flushDebounceMs: 5000,
  hourMs: 60 * 60 * 1000,
} as const;
