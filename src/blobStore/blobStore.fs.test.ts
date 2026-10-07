import 'fake-indexeddb/auto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blobStoreContract } from './contract';
import { BlobDB } from './db';
import { createFsBackend, type BlobFilesBridge } from './fsBackend';
import { sha256Hex } from './hash';

// The Electron main-process module is plain CommonJS outside src/, so load it the way Node does.
const { createBlobFiles, isValidHash } = createRequire(import.meta.url)('../../electron/blobFiles.cjs') as {
  createBlobFiles(o: { root: string }): BlobFilesBridge;
  isValidHash(hash: unknown): boolean;
};

/** What the preload bridge does: every value crosses IPC as a structured clone. */
function overIpc(files: BlobFilesBridge): BlobFilesBridge {
  return {
    write: (hash, bytes) => files.write(hash, new Uint8Array(bytes)),
    read: async (hash) => {
      const bytes = await files.read(hash);
      return bytes ? new Uint8Array(bytes) : null;
    },
    has: (hash) => files.has(hash),
    remove: (hash) => files.remove(hash),
    list: () => files.list(),
  };
}

let n = 0;
blobStoreContract('desktop files', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ar-blobs-'));
  const db = new BlobDB(`blobs-fs-test-${++n}`);
  return {
    backend: createFsBackend(overIpc(createBlobFiles({ root: path.join(root, 'blobs') }))),
    index: db.blobIndex,
    cleanup: async () => {
      await db.delete();
      rmSync(root, { recursive: true, force: true });
    },
  };
});

describe('desktop blob files (main process)', () => {
  let root: string;
  let files: BlobFilesBridge;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'ar-blobs-'));
    files = createBlobFiles({ root });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts a SHA-256 hex name and nothing else', async () => {
    expect(isValidHash('a'.repeat(64))).toBe(true);
    for (const bad of ['../' + 'a'.repeat(61), 'A'.repeat(64), 'a'.repeat(63), '', '..', 'aa/../../x', null, 42]) {
      expect(isValidHash(bad)).toBe(false);
      await expect(files.read(bad as string)).rejects.toThrow('Invalid blob hash');
      await expect(files.remove(bad as string)).rejects.toThrow('Invalid blob hash');
    }
  });

  it('refuses bytes that do not hash to their name', async () => {
    const hash = await sha256Hex(new TextEncoder().encode('real'));
    await expect(files.write(hash, new TextEncoder().encode('fake'))).rejects.toThrow('do not match');
    expect(await files.list()).toEqual([]);
  });

  it('keeps files in a two-level folder and clears temporary leftovers', async () => {
    const bytes = new TextEncoder().encode('book');
    const hash = await sha256Hex(bytes);
    await files.write(hash, bytes);
    expect(readdirSync(path.join(root, hash.slice(0, 2)))).toEqual([hash]);

    // A write killed before its rename, and a stray file the app did not make.
    writeFileSync(path.join(root, hash.slice(0, 2), '.tmp-dead'), 'x');
    mkdirSync(path.join(root, 'zz'));
    writeFileSync(path.join(root, 'zz', 'notes.txt'), 'x');
    expect(await files.list()).toEqual([hash]);
    expect(readdirSync(path.join(root, hash.slice(0, 2)))).toEqual([hash]);
  });

  it('lists nothing before the folder exists', async () => {
    expect(await createBlobFiles({ root: path.join(root, 'not-yet') }).list()).toEqual([]);
  });
});
