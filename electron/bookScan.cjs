// Finds the books on this computer, run in Electron's main process only (src/openInPlace/scan is the renderer side).
// The walk reads names, sizes and dates and nothing else: no file is opened or hashed until the reader opens it. It
// goes through the usual places (and any folders the reader adds), twelve folders deep, skipping hidden folders,
// system folders, AppData, node_modules, .git and app bundles. What it finds is kept in `<userData>/scan.json`, and a
// path in that list is a path the reader may open (scan:open-result, scan:read-result): nothing else is. Kept free of
// Electron imports so it can be unit-tested.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_DEPTH = 12;
/** TXT and Markdown smaller than this are notes and READMEs, not books. */
const MIN_TEXT_BYTES = 1024;
const OPEN_IN_PLACE = ['pdf', 'epub'];
const ADD_ONLY = ['mobi', 'azw3', 'txt', 'md'];
const TEXT_FORMATS = ['txt', 'md'];
const SKIPPED_FOLDERS = new Set([
  'appdata',
  'node_modules',
  '.git',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'system volume information',
  '$recycle.bin',
]);
const SKIPPED_SUFFIXES = ['.app', '.framework', '.photoslibrary'];

const formatOf = (name) => path.extname(name).slice(1).toLowerCase();

function skipFolder(name) {
  const lower = name.toLowerCase();
  return name.startsWith('.') || name.startsWith('$') || SKIPPED_FOLDERS.has(lower) || SKIPPED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/** A path as a comparison key: Windows paths ignore case. */
const keyOf = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));

/** Folders in the list that sit inside another folder in it are dropped: the outer walk already covers them. */
function withoutNested(folders) {
  const unique = [...new Map(folders.map((folder) => [keyOf(folder), path.resolve(folder)])).entries()];
  return unique
    .filter(([key]) => !unique.some(([other]) => other !== key && key.startsWith(other.endsWith(path.sep) ? other : other + path.sep)))
    .map(([, folder]) => folder);
}

/**
 * @param {{ userDataDir: string, getRoots: () => string[], progressMs?: number }} options
 *   `getRoots`: the usual places (Documents, Downloads, ...); those that do not exist are skipped.
 */
function createBookScan({ userDataDir, getRoots, progressMs = 200 }) {
  const file = path.join(userDataDir, 'scan.json');
  let loaded = false;
  let extraFolders = [];
  let results = [];
  let roots = [];
  let scannedAt = null;
  let allowed = new Set();
  /** The scan in progress: its promise and whether it has been told to stop. */
  let running = null;

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      extraFolders = Array.isArray(saved.extraFolders) ? saved.extraFolders.filter((f) => typeof f === 'string') : [];
      results = Array.isArray(saved.results) ? saved.results.filter((r) => r && typeof r.path === 'string') : [];
      roots = Array.isArray(saved.roots) ? saved.roots.filter((f) => typeof f === 'string') : [];
      scannedAt = typeof saved.scannedAt === 'number' ? saved.scannedAt : null;
    } catch {
      // Nothing saved yet, or unreadable: start empty.
    }
    allowed = new Set(results.map((r) => keyOf(r.path)));
  }

  async function save() {
    await fs.mkdir(userDataDir, { recursive: true });
    const temp = `${file}.tmp-${crypto.randomUUID()}`;
    try {
      await fs.writeFile(temp, JSON.stringify({ extraFolders, roots, results, scannedAt }), 'utf8');
      await fs.rename(temp, file);
    } catch (error) {
      await fs.rm(temp, { force: true });
      throw error;
    }
  }

  async function existingFolders(folders) {
    const out = [];
    for (const folder of folders) {
      try {
        if ((await fs.stat(folder)).isDirectory()) out.push(folder);
      } catch {
        // Not there on this computer.
      }
    }
    return out;
  }

  const snapshot = () => ({ roots: [...roots], extraFolders: [...extraFolders], results: [...results], scannedAt, running: running !== null });

  return {
    /** The last scan: where it looked, what it found, when. */
    async state() {
      await load();
      return snapshot();
    },

    /**
     * Walks the roots and `extra` (only those the reader has added are honoured). `onProgress({checked, found, done,
     * added})` is called at most every `progressMs`, with the books found since the last call, and once more when done.
     * Resolves to { checked, found, cancelled }.
     */
    async start({ extra, onProgress } = {}) {
      await load();
      if (running) return running.promise;
      const stop = { cancelled: false };
      const wanted = extra ? extraFolders.filter((folder) => extra.some((e) => keyOf(e) === keyOf(folder))) : extraFolders;
      const promise = (async () => {
        const walkRoots = withoutNested(await existingFolders([...getRoots(), ...wanted]));
        const found = [];
        let checked = 0;
        let sent = 0;
        let lastTick = 0;
        const tick = (done) => {
          if (!onProgress) return;
          const now = Date.now();
          if (!done && now - lastTick < progressMs) return;
          lastTick = now;
          const added = found.slice(sent);
          sent = found.length;
          onProgress({ checked, found: found.length, done, added });
        };

        const queue = walkRoots.map((folder) => ({ folder, depth: 0 }));
        while (queue.length > 0 && !stop.cancelled) {
          const { folder, depth } = queue.pop();
          let dir;
          try {
            dir = await fs.opendir(folder);
          } catch {
            continue; // No permission, or it vanished.
          }
          try {
            for await (const entry of dir) {
              if (stop.cancelled) break;
              if (entry.isSymbolicLink()) continue; // A link could lead back up the tree.
              const full = path.join(folder, entry.name);
              if (entry.isDirectory()) {
                if (depth < MAX_DEPTH && !skipFolder(entry.name)) queue.push({ folder: full, depth: depth + 1 });
                continue;
              }
              if (!entry.isFile()) continue;
              checked++;
              const format = formatOf(entry.name);
              if (OPEN_IN_PLACE.includes(format) || ADD_ONLY.includes(format)) {
                try {
                  const stat = await fs.stat(full);
                  if (!(TEXT_FORMATS.includes(format) && stat.size <= MIN_TEXT_BYTES)) {
                    found.push({ path: full, name: entry.name, format, size: stat.size, mtime: Math.floor(stat.mtimeMs) });
                  }
                } catch {
                  // Gone since it was listed.
                }
              }
              tick(false);
            }
          } catch {
            // The folder became unreadable part-way: keep what was found.
          } finally {
            await dir.close().catch(() => {});
          }
        }
        // A cancelled scan keeps what it found so far; the list is replaced either way.
        results = found;
        roots = walkRoots;
        scannedAt = Date.now();
        allowed = new Set(results.map((r) => keyOf(r.path)));
        await save();
        tick(true);
        return { checked, found: found.length, cancelled: stop.cancelled };
      })();
      running = { promise, stop };
      try {
        return await promise;
      } finally {
        running = null;
      }
    },

    /** Asks the scan in progress to stop; it keeps what it found. */
    stop() {
      if (running) running.stop.cancelled = true;
    },

    /** Adds a folder to look in (a path the reader chose in the folder dialog). Resolves to the list. */
    async addFolder(folder) {
      await load();
      const full = path.resolve(folder);
      if (!(await fs.stat(full)).isDirectory()) throw new Error('Not a folder.');
      if (!extraFolders.some((f) => keyOf(f) === keyOf(full))) extraFolders.push(full);
      await save();
      return [...extraFolders];
    },

    async removeFolder(folder) {
      await load();
      extraFolders = extraFolders.filter((f) => keyOf(f) !== keyOf(folder));
      await save();
      return [...extraFolders];
    },

    /** True for a path the last scan found: the only paths scan:open-result and scan:read-result accept. */
    async isResult(file) {
      await load();
      return typeof file === 'string' && allowed.has(keyOf(file));
    },

    /** The result entry for a path, or null. */
    async resultOf(file) {
      await load();
      const key = typeof file === 'string' ? keyOf(file) : '';
      return results.find((r) => keyOf(r.path) === key) ?? null;
    },
  };
}

module.exports = { createBookScan, withoutNested, skipFolder, MAX_DEPTH, MIN_TEXT_BYTES };
