// Folder access for sync, run in Electron's main process only. The renderer
// never gets a path: it asks for `<deviceId>/<file>.json` relative paths and
// this module resolves them inside the one folder the user picked, refusing
// anything else. Kept free of Electron imports so it can be unit-tested.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILE_BYTES = 64 * 1024 * 1024;

// `<folder>/<file>.json`, each part a plain name: no dots-only segments, no
// separators, nothing that could climb out of the sync folder.
const PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isValidRelativePath(rel) {
  if (typeof rel !== 'string') return false;
  const parts = rel.split('/');
  return parts.length === 2 && parts.every((p) => PART.test(p) && !p.includes('..')) && parts[1].endsWith('.json');
}

/**
 * @param {{ getRoot: () => string | null }} options  `getRoot` returns the folder
 *   the user chose, or null when none is set.
 */
function createSyncFolder({ getRoot }) {
  function resolve(rel) {
    const root = getRoot();
    if (!root) throw new Error('No sync folder has been chosen.');
    if (!isValidRelativePath(rel)) throw new Error('Invalid sync path.');
    const full = path.join(root, ...rel.split('/'));
    // Belt and braces on top of the name check.
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid sync path.');
    return full;
  }

  return {
    isValidRelativePath,

    /** Every `<folder>/<file>.json` one level below the root. Hidden and temporary files are ignored. */
    async list() {
      const root = getRoot();
      if (!root) throw new Error('No sync folder has been chosen.');
      const out = [];
      for (const dir of await fs.readdir(root, { withFileTypes: true })) {
        if (!dir.isDirectory() || !PART.test(dir.name)) continue;
        for (const file of await fs.readdir(path.join(root, dir.name), { withFileTypes: true })) {
          const rel = `${dir.name}/${file.name}`;
          if (file.isFile() && isValidRelativePath(rel)) out.push(rel);
        }
      }
      return out.sort();
    },

    async read(rel) {
      const full = resolve(rel);
      const { size } = await fs.stat(full);
      if (size > MAX_FILE_BYTES) throw new Error('Sync file is too large.');
      return fs.readFile(full, 'utf8');
    },

    /**
     * Create a file that must not already exist. Written under a temporary name
     * and renamed into place, so another device never sees a half-written file.
     */
    async write(rel, text) {
      const full = resolve(rel);
      if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new Error('Sync file is too large.');
      await fs.mkdir(path.dirname(full), { recursive: true });
      try {
        await fs.access(full);
        throw new Error(`File already exists: ${rel}`);
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error;
      }
      const temp = path.join(path.dirname(full), `.tmp-${crypto.randomUUID()}`);
      try {
        await fs.writeFile(temp, text, { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temp, full);
      } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
      }
    },

    async remove(rel) {
      await fs.rm(resolve(rel), { force: true });
    },
  };
}

module.exports = { createSyncFolder, isValidRelativePath };
