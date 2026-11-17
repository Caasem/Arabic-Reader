// Files the reader opened in place, run in Electron's main process only (src/openInPlace is the renderer side).
// The renderer never gets a path it could read from: a file the OS handed us, or the reader chose in a dialog, is
// given an opaque token for this run; a file seen before is found again by its SHA-256. The record of what we may
// read is `<userData>/disk-files.json` (hash -> path, size, mtime), written whenever a file is opened or found
// again. Hashing streams the file (a PDF can be hundreds of MB) and is remembered by path + size + mtime, so
// reopening a large file does not hash it again. Kept free of Electron imports so it can be unit-tested.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HASH = /^[0-9a-f]{64}$/;
const isValidHash = (hash) => typeof hash === 'string' && HASH.test(hash);

/** The file's SHA-256 as hex, read as a stream. */
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Two stats agree when the file is, as far as the disk can tell, the one we recorded. */
const sameStat = (stat, entry) => stat.size === entry.size && Math.floor(stat.mtimeMs) === entry.mtime;
const statOf = (stat) => ({ size: stat.size, mtime: Math.floor(stat.mtimeMs) });

/** @param {{ userDataDir: string }} options */
function createDiskFiles({ userDataDir }) {
  const indexFile = path.join(userDataDir, 'disk-files.json');
  /** token -> absolute path, for this run only. */
  const tokens = new Map();
  /** absolute path -> token, so the same file keeps one token. */
  const tokenOfPath = new Map();
  /** hash -> { path, size, mtime } */
  let index = null;
  /** `${path}|${size}|${mtime}` -> hash */
  const hashCache = new Map();
  let writing = Promise.resolve();

  async function load() {
    if (index) return index;
    const loaded = {};
    try {
      const parsed = JSON.parse(await fs.readFile(indexFile, 'utf8'));
      for (const [hash, entry] of Object.entries(parsed ?? {})) {
        if (isValidHash(hash) && entry && typeof entry.path === 'string' && Number.isFinite(entry.size) && Number.isFinite(entry.mtime)) {
          loaded[hash] = { path: entry.path, size: entry.size, mtime: entry.mtime };
          hashCache.set(`${entry.path}|${entry.size}|${entry.mtime}`, hash);
        }
      }
    } catch {
      // No file yet, or unreadable: start empty. The next save replaces it.
    }
    // Two callers may load at once; the first to finish wins.
    index ??= loaded;
    return index;
  }

  /** Writes are queued and go to a temporary name first, so a kill never leaves a half-written index. */
  function save() {
    writing = writing
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(userDataDir, { recursive: true });
        const temp = `${indexFile}.tmp-${crypto.randomUUID()}`;
        try {
          await fs.writeFile(temp, JSON.stringify(index), 'utf8');
          await fs.rename(temp, indexFile);
        } catch (error) {
          await fs.rm(temp, { force: true });
          throw error;
        }
      });
    return writing;
  }

  const pathOf = (token) => {
    const file = tokens.get(token);
    if (!file) throw new Error('Unknown file.');
    return file;
  };

  /** Hashes a path, or returns the remembered hash when path + size + mtime are unchanged. */
  async function hashOf(file, stat) {
    await load();
    const key = `${file}|${stat.size}|${Math.floor(stat.mtimeMs)}`;
    const cached = hashCache.get(key);
    if (cached) return cached;
    const hash = await hashFile(file);
    hashCache.set(key, hash);
    return hash;
  }

  async function record(hash, file, stat) {
    await load();
    const entry = { path: file, ...statOf(stat) };
    const old = index[hash];
    if (old && old.path === entry.path && old.size === entry.size && old.mtime === entry.mtime) return;
    index[hash] = entry;
    await save();
  }

  return {
    /** An opaque token for a path the OS or a dialog handed us. The same path always gets the same token. */
    register(file) {
      const full = path.resolve(file);
      let token = tokenOfPath.get(full);
      if (!token) {
        token = crypto.randomUUID();
        tokens.set(token, full);
        tokenOfPath.set(full, token);
      }
      return token;
    },

    /** The path behind a token, for the main process only (window titles, de-duplication). */
    pathOfToken: (token) => tokens.get(token) ?? null,

    /** Name, size, date, ext and SHA-256 of a registered file; remembers where the hash was seen. */
    async describe(token) {
      const file = pathOf(token);
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('Not a file.');
      const hash = await hashOf(file, stat);
      await record(hash, file, stat);
      return { name: path.basename(file), size: stat.size, mtime: Math.floor(stat.mtimeMs), hash, ext: path.extname(file).slice(1).toLowerCase() };
    },

    /** The bytes of a registered file. */
    async read(token) {
      return new Uint8Array(await fs.readFile(pathOf(token)));
    },

    /** The bytes of a file recorded under this hash, or null when it is gone, changed, or never seen. */
    async readByHash(hash) {
      if (!isValidHash(hash)) return null;
      const entry = (await load())[hash];
      if (!entry) return null;
      try {
        const stat = await fs.stat(entry.path);
        if (!stat.isFile() || !sameStat(stat, entry)) return null;
        return new Uint8Array(await fs.readFile(entry.path));
      } catch {
        return null;
      }
    },

    /** True when the recorded path still exists with the recorded size and date. */
    async has(hash) {
      if (!isValidHash(hash)) return false;
      const entry = (await load())[hash];
      if (!entry) return false;
      try {
        const stat = await fs.stat(entry.path);
        return stat.isFile() && sameStat(stat, entry);
      } catch {
        return false;
      }
    },

    /** Accepts a file the reader picked for this hash only when its bytes match; records the new place. */
    async locate(hash, file) {
      if (!isValidHash(hash)) return false;
      const stat = await fs.stat(file);
      if (!stat.isFile()) return false;
      if ((await hashOf(file, stat)) !== hash) return false;
      await record(hash, path.resolve(file), stat);
      return true;
    },

    /** Every recorded path, for "In library" matching in the scan. */
    async knownPaths() {
      return Object.values(await load()).map((entry) => entry.path);
    },
  };
}

module.exports = { createDiskFiles, hashFile, isValidHash };
