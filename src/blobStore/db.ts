import Dexie, { type Table } from 'dexie';

/**
 * One row per stored blob. `refs` holds each reference as `<ns>\n<owner>`;
 * `ns` is the set of namespaces among them, indexed for `list(ns)`.
 */
export interface BlobIndexRow {
  hash: string;
  size: number;
  type: string;
  addedAt: number;
  ns: string[];
  refs: string[];
}

export interface BlobBytesRow {
  hash: string;
  data: Blob;
}

/**
 * The BlobStore's own database, apart from the main one so the main database
 * stays small and quick to back up. `blobIndex` is used on every platform;
 * `blobs` holds the bytes only for the IndexedDB backend (the desktop app keeps
 * them as files).
 */
export class BlobDB extends Dexie {
  blobs!: Table<BlobBytesRow, string>;
  blobIndex!: Table<BlobIndexRow, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-blobs') {
    super(name);
    this.version(1).stores({
      blobs: 'hash',
      blobIndex: 'hash, *ns',
    });
  }
}
