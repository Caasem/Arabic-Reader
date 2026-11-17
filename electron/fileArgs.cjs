// Picks the book files out of a command line (the OS passes a double-clicked file as an argument), in Electron's
// main process only. Kept free of Electron imports so it can be unit-tested.
const fs = require('node:fs');
const path = require('node:path');

/** Opened in place: the reader shows the file where it is. */
const IN_PLACE_EXTS = ['.pdf', '.epub'];
/** Needs converting, so it goes through the ordinary import. */
const IMPORT_EXTS = ['.mobi', '.azw3', '.txt', '.md'];
const BOOK_EXTS = [...IN_PLACE_EXTS, ...IMPORT_EXTS];

const extOf = (file) => path.extname(file).toLowerCase();
const isInPlaceExt = (file) => IN_PLACE_EXTS.includes(extOf(file));

/**
 * The existing book files in an argv, as absolute paths, in order and without repeats. Skips flags (including
 * `--user-data-dir=...`), the app's own path, and anything that is not an existing file of a book format.
 * @param {string[]} argv
 * @param {{ cwd?: string, appPath?: string }} [options]  `cwd` resolves relative names (second-instance gives one).
 */
function pickOpenablePaths(argv, { cwd = process.cwd(), appPath } = {}) {
  const out = [];
  for (const arg of argv) {
    if (typeof arg !== 'string' || arg === '' || arg.startsWith('-')) continue;
    if (!BOOK_EXTS.includes(extOf(arg))) continue;
    const full = path.resolve(cwd, arg);
    if (appPath && full === path.resolve(appPath)) continue;
    if (out.includes(full)) continue;
    try {
      if (fs.statSync(full).isFile()) out.push(full);
    } catch {
      // Missing or unreadable: not openable.
    }
  }
  return out;
}

module.exports = { pickOpenablePaths, isInPlaceExt, BOOK_EXTS, IN_PLACE_EXTS, IMPORT_EXTS };
