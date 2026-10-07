import type { Table } from 'dexie';
import { blobNamespaceSpec } from '../storage/registry';
import type { BlobIndexRow } from './db';
import { sha256Hex } from './hash';
import {
  HASH_PATTERN,
  QuotaError,
  UndeclaredNamespaceError,
  isQuotaError,
  type BlobRef,
  type BlobStore,
  type BlobUsage,
  type ByteBackend,
  type RepairReport,
} from './types';

export interface BlobStoreOptions {
  backend: ByteBackend;
  index: Table<BlobIndexRow, string>;
  /** Defaults to the namespaces declared in the StorageRegistry. */
  isDeclaredNamespace?: (ns: string) => boolean;
  /** Name of the cross-tab lock that serialises changes to the index. */
  lockName?: string;
  now?: () => number;
}

const NS_PATTERN = /^[a-z][a-z0-9-]*$/;
const refKey = (ns: string, owner: string) => `${ns}\n${owner}`;
const refNs = (ref: string) => ref.slice(0, ref.indexOf('\n'));
const refOwner = (ref: string) => ref.slice(ref.indexOf('\n') + 1);

function withRefs(row: BlobIndexRow, refs: string[]): BlobIndexRow {
  const sorted = Array.from(new Set(refs)).sort();
  return { ...row, refs: sorted, ns: Array.from(new Set(sorted.map(refNs))).sort() };
}

function toRef(row: BlobIndexRow, ns: string): BlobRef {
  return {
    hash: row.hash,
    size: row.size,
    type: row.type,
    ns,
    owners: row.refs.filter((r) => refNs(r) === ns).map(refOwner),
    addedAt: row.addedAt,
  };
}

/**
 * Runs `fn` while holding the store's lock: the Web Locks API where it exists
 * (so two tabs never interleave an index update with a repair scan), else a
 * queue in this page.
 */
function createLock(name: string): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks) return locks.request(name, fn) as Promise<T>;
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * The BlobStore over any byte backend. Order of writes, so that a kill at any
 * point leaves at worst unindexed bytes, which `repair()` removes:
 * put writes the bytes, then the index row; dropping the last reference
 * deletes the index row, then the bytes.
 */
export function createBlobStore(options: BlobStoreOptions): BlobStore {
  const { backend, index } = options;
  const isDeclared = options.isDeclaredNamespace ?? ((ns: string) => blobNamespaceSpec(ns)?.kind === 'blob-namespace');
  const now = options.now ?? Date.now;
  const exclusive = createLock(options.lockName ?? 'arabic-reader-blobs');

  function checkRef(ns: string, owner: string): void {
    if (!NS_PATTERN.test(ns) || !isDeclared(ns)) throw new UndeclaredNamespaceError(ns);
    if (typeof owner !== 'string' || owner.length === 0) throw new Error('A BlobStore reference needs an owner.');
  }

  async function writeBytes(hash: string, data: Blob): Promise<void> {
    try {
      await backend.write(hash, data);
    } catch (error) {
      await backend.delete(hash).catch(() => undefined);
      throw isQuotaError(error) ? new QuotaError(undefined, { cause: error }) : error;
    }
  }

  async function saveRow(row: BlobIndexRow): Promise<void> {
    try {
      await index.put(row);
    } catch (error) {
      throw isQuotaError(error) ? new QuotaError(undefined, { cause: error }) : error;
    }
  }

  /** Replaces the row's references; at zero, removes the row and then the bytes. */
  async function setRefs(row: BlobIndexRow, refs: string[]): Promise<void> {
    if (refs.length > 0) {
      await saveRow(withRefs(row, refs));
      return;
    }
    await index.delete(row.hash);
    await backend.delete(row.hash);
  }

  async function* rowsFor(ns?: string): AsyncIterable<BlobIndexRow> {
    const rows = ns === undefined ? await index.toArray() : await index.where('ns').equals(ns).toArray();
    yield* rows;
  }

  const store: BlobStore = {
    async put(data, { ns, owner, type }) {
      checkRef(ns, owner);
      const mime = type ?? (data instanceof Blob ? data.type : '');
      const blob = data instanceof Blob && data.type === mime ? data : new Blob([data as BlobPart], { type: mime });
      const hash = await sha256Hex(data);
      return exclusive(async () => {
        const existing = await index.get(hash);
        if (existing) {
          if (existing.size !== blob.size) console.error(`BlobStore: ${hash} stored with size ${existing.size}, put with ${blob.size}.`);
          // Bytes lost outside the app come back with the next put of the same file.
          if (!(await backend.has(hash))) await writeBytes(hash, blob);
          const key = refKey(ns, owner);
          if (existing.refs.includes(key)) return toRef(existing, ns);
          const row = withRefs(existing, [...existing.refs, key]);
          await saveRow(row);
          return toRef(row, ns);
        }
        await writeBytes(hash, blob);
        const row = withRefs({ hash, size: blob.size, type: mime, addedAt: now(), ns: [], refs: [] }, [refKey(ns, owner)]);
        try {
          await saveRow(row);
        } catch (error) {
          // Nothing half-indexed: the bytes go with the failed index write.
          await backend.delete(hash).catch(() => undefined);
          throw error;
        }
        return toRef(row, ns);
      });
    },

    async get(hash) {
      const row = HASH_PATTERN.test(hash) ? await index.get(hash) : undefined;
      return row ? backend.read(hash, row.type) : undefined;
    },

    async has(hash) {
      if (!HASH_PATTERN.test(hash) || !(await index.get(hash))) return false;
      return backend.has(hash);
    },

    pin(hash, ns, owner) {
      checkRef(ns, owner);
      return exclusive(async () => {
        const row = await index.get(hash);
        if (!row) return false;
        const key = refKey(ns, owner);
        if (!row.refs.includes(key)) await saveRow(withRefs(row, [...row.refs, key]));
        return true;
      });
    },

    unpin(hash, ns, owner) {
      return exclusive(async () => {
        const row = await index.get(hash);
        const key = refKey(ns, owner);
        if (row?.refs.includes(key)) await setRefs(row, row.refs.filter((r) => r !== key));
      });
    },

    delete(hash, ns) {
      return exclusive(async () => {
        const row = await index.get(hash);
        if (row?.ns.includes(ns)) await setRefs(row, row.refs.filter((r) => refNs(r) !== ns));
      });
    },

    async *list(ns) {
      for await (const row of rowsFor(ns)) {
        for (const n of row.ns) if (ns === undefined || n === ns) yield toRef(row, n);
      }
    },

    async usage() {
      const out: BlobUsage = {};
      for await (const row of rowsFor()) {
        for (const ns of row.ns) {
          const entry = (out[ns] ??= { count: 0, bytes: 0 });
          entry.count++;
          entry.bytes += row.size;
        }
      }
      return out;
    },

    async url(hash) {
      const blob = await store.get(hash);
      return blob ? URL.createObjectURL(blob) : undefined;
    },

    async verify(hash) {
      const blob = await store.get(hash);
      return blob ? (await sha256Hex(blob)) === hash : false;
    },

    repair() {
      return exclusive(async (): Promise<RepairReport> => {
        const stored = new Set((await backend.hashes()).filter((h) => HASH_PATTERN.test(h)));
        const indexed = new Set((await index.toCollection().primaryKeys()) as string[]);
        const orphansRemoved = [...stored].filter((h) => !indexed.has(h)).sort();
        const missing = [...indexed].filter((h) => !stored.has(h)).sort();
        for (const hash of orphansRemoved) await backend.delete(hash);
        await index.bulkDelete(missing);
        return { orphansRemoved, missing };
      });
    },
  };
  return store;
}
