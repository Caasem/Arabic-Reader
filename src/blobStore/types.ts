/**
 * BlobStore: content-addressed bytes for class B (user files) and class C
 * (reference packs). docs/specs/data-architecture.md section 5.2.
 *
 * A blob is kept while at least one reference holds it. A reference is an
 * owner inside a namespace: `('book', <bookId>)`, `('pack', 'alsihah@3')`.
 * Two books with identical bytes share one blob; removing one book's
 * reference never touches the other's.
 */
export interface BlobRef {
  /** SHA-256 of the bytes, lowercase hex. */
  hash: string;
  size: number;
  /** MIME type given at the first put ('' when none was given). */
  type: string;
  ns: string;
  /** Owners holding this blob in `ns`. */
  owners: string[];
  addedAt: number;
}

export type BlobUsage = Record<string, { count: number; bytes: number }>;

export interface RepairReport {
  /** Bytes with no index row (a put or delete interrupted between its two writes); removed. */
  orphansRemoved: string[];
  /** Index rows whose bytes are gone (lost outside the app); their rows are removed. */
  missing: string[];
}

export interface BlobStore {
  /**
   * Stores the bytes (once, whoever puts them) and adds the reference
   * `(ns, owner)`. Idempotent. The hash is always computed here, never trusted
   * from the caller. Throws QuotaError when the device is full, leaving nothing behind.
   */
  put(data: Blob | Uint8Array, opts: { ns: string; owner: string; type?: string }): Promise<BlobRef>;
  get(hash: string): Promise<Blob | undefined>;
  /** True when the blob is indexed and its bytes are present. */
  has(hash: string): Promise<boolean>;
  /** Adds a reference to bytes already stored. Returns false when the blob is not here. */
  pin(hash: string, ns: string, owner: string): Promise<boolean>;
  /** Drops one reference; the bytes go when none remain. */
  unpin(hash: string, ns: string, owner: string): Promise<void>;
  /** Drops every reference in `ns`; the bytes go when none remain. */
  delete(hash: string, ns: string): Promise<void>;
  /** One BlobRef per blob and namespace holding it, optionally for one namespace. */
  list(ns?: string): AsyncIterable<BlobRef>;
  /** Count and bytes per namespace. A blob shared by two namespaces counts in both. */
  usage(): Promise<BlobUsage>;
  /** An object URL for playback or display; the caller revokes it. */
  url(hash: string): Promise<string | undefined>;
  /** Re-hashes the stored bytes. For export and repair paths, not ordinary reads. */
  verify(hash: string): Promise<boolean>;
  /** Scans the backend against the index and fixes what an interrupted write left behind. */
  repair(): Promise<RepairReport>;
}

/**
 * Where the bytes live. The BlobStore keeps the index (references, sizes) in
 * IndexedDB on every platform; a backend only stores and returns bytes by hash.
 */
export interface ByteBackend {
  readonly name: string;
  write(hash: string, data: Blob): Promise<void>;
  read(hash: string, type: string): Promise<Blob | undefined>;
  has(hash: string): Promise<boolean>;
  delete(hash: string): Promise<void>;
  /** Every hash with bytes stored. */
  hashes(): Promise<string[]>;
}

/** The device has no room for the bytes. Callers show "Not enough space". */
export class QuotaError extends Error {
  constructor(message = 'Not enough space on this device.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QuotaError';
  }
}

/** A namespace that is not declared in src/storage/registry.ts. */
export class UndeclaredNamespaceError extends Error {
  constructor(ns: string) {
    super(`BlobStore namespace "${ns}" is not declared in src/storage/registry.ts.`);
    this.name = 'UndeclaredNamespaceError';
  }
}

export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Whether an error from IndexedDB, Dexie or the desktop file bridge means "out of space". */
export function isQuotaError(error: unknown): boolean {
  if (error instanceof QuotaError) return true;
  for (let e: unknown = error, depth = 0; e && depth < 4; depth++) {
    const err = e as { name?: string; code?: string; message?: string; inner?: unknown; cause?: unknown };
    if (err.name === 'QuotaExceededError' || err.code === 'ENOSPC' || /QuotaExceeded|ENOSPC/.test(String(err.message ?? ''))) return true;
    e = err.inner ?? err.cause;
  }
  return false;
}
