// BlobStore bytes as files, run in Electron's main process only
// (src/blobStore/fsBackend.ts is the renderer side). Files live under one
// folder the app owns, `<userData>/blobs/<first two hex>/<sha256>`. The
// renderer only ever passes a SHA-256 hex string; anything else is refused,
// and a write whose bytes do not hash to its name is refused too. Kept free of
// Electron imports so it can be unit-tested.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/;

function isValidHash(hash) {
  return typeof hash === 'string' && HASH.test(hash);
}

/** @param {{ root: string }} options  The folder the blobs live in (created on first write). */
function createBlobFiles({ root }) {
  const base = path.resolve(root);

  function fileOf(hash) {
    if (!isValidHash(hash)) throw new Error('Invalid blob hash.');
    return path.join(base, hash.slice(0, 2), hash);
  }

  const missing = (error) => error && error.code === 'ENOENT';

  return {
    /** Stores the bytes under their hash. Written to a temporary name and renamed, so a kill never leaves a half file under a real name. */
    async write(hash, bytes) {
      const full = fileOf(hash);
      const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (crypto.createHash('sha256').update(buffer).digest('hex') !== hash) throw new Error('Blob bytes do not match their hash.');
      await fs.mkdir(path.dirname(full), { recursive: true });
      const temp = path.join(path.dirname(full), `.tmp-${crypto.randomUUID()}`);
      try {
        await fs.writeFile(temp, buffer, { flag: 'wx' });
        await fs.rename(temp, full);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
    },

    /** The bytes, or null when there is no such blob. */
    async read(hash) {
      try {
        return new Uint8Array(await fs.readFile(fileOf(hash)));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async has(hash) {
      try {
        return (await fs.stat(fileOf(hash))).isFile();
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },

    async remove(hash) {
      await fs.rm(fileOf(hash), { force: true });
    },

    /** Every stored hash. Temporary files from an interrupted write are removed on the way. */
    async list() {
      const out = [];
      let dirs;
      try {
        dirs = await fs.readdir(base, { withFileTypes: true });
      } catch (error) {
        if (missing(error)) return out;
        throw error;
      }
      for (const dir of dirs) {
        if (!dir.isDirectory() || !/^[0-9a-f]{2}$/.test(dir.name)) continue;
        for (const file of await fs.readdir(path.join(base, dir.name), { withFileTypes: true })) {
          if (!file.isFile()) continue;
          if (file.name.startsWith('.tmp-')) await fs.rm(path.join(base, dir.name, file.name), { force: true });
          else if (isValidHash(file.name) && file.name.startsWith(dir.name)) out.push(file.name);
        }
      }
      return out.sort();
    },
  };
}

module.exports = { createBlobFiles, isValidHash };
