// Electron main process (plain CommonJS -- simplest for Electron's entry
// point regardless of the rest of the project being ESM).
//
// The built app (dist/) is served from a privileged custom `app://bundle`
// scheme. That gives the app one fixed origin for the life of the install,
// which matters because IndexedDB/localStorage are scoped per origin: the
// previous approach (a local HTTP server on a random port) produced a new
// origin -- and therefore empty storage -- on every launch.
const { app, BrowserWindow, dialog, ipcMain, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSyncFolder } = require('./syncFolder.cjs');
const { createBlobFiles } = require('./blobFiles.cjs');
const { createOcrEngines } = require('./ocrEngines.cjs');
const { startAutoUpdate } = require('./autoUpdate.cjs');
const { createDiskFiles } = require('./diskFiles.cjs');
const { pickOpenablePaths, isInPlaceExt, BOOK_EXTS } = require('./fileArgs.cjs');
const { createWindowRegistry } = require('./windowRegistry.cjs');

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.epub': 'application/epub+zip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// Book sections render in srcdoc iframes, which inherit this policy -- so
// book styles/images (epub.js serves them as blob: URLs) must stay allowed,
// while any script not shipped with the app is blocked. AnkiConnect runs on
// localhost:8765; the Shamela beta reads from one named mirror (shamelaBooksProvider.ts); the
// optional Claude vision engine for scanned pages (src/pdf/ocr/aiEngine.ts) calls api.anthropic.com, and the offline reading model (src/pdf/ocr/paddle) is downloaded once from huggingface.co and run as WebAssembly.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' blob: data: http://127.0.0.1:8765 http://localhost:8765 https://winongkencono-shamelah.hf.space https://api.anthropic.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "frame-src 'self' blob:",
  "object-src 'none'",
].join('; ');

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
      allowServiceWorkers: true,
    },
  },
]);

async function serveAppRequest(request) {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });

  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';
  let filePath = path.normalize(path.join(DIST_DIR, relativePath));
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    // Extensionless paths are app navigations -- fall back to the SPA shell.
    // A missing asset is a genuine 404, not an HTML page.
    if (path.extname(filePath)) return new Response('Not found', { status: 404 });
    filePath = path.join(DIST_DIR, 'index.html');
    data = await fs.readFile(filePath);
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': contentType };
  if (contentType.startsWith('text/html')) headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY;
  return new Response(data, { headers });
}

function isExternalWebUrl(url) {
  try {
    const { protocol: scheme } = new URL(url);
    return scheme === 'https:' || scheme === 'http:';
  } catch {
    return false;
  }
}

// --- Windows -------------------------------------------------------------------
// One main window (Library and everything else) and any number of light windows: the reader alone, one book each,
// opened by double-clicking a file or from the Library. Each window is its own renderer; they share one IndexedDB.
const windowRegistry = createWindowRegistry();
/** BrowserWindow id -> the file path it was opened for, so the same file focuses its window instead of a second. */
const pathOfWindow = new Map();
let mainWindow = null;

// F11 toggles real fullscreen anywhere in the app (the hidden menu bar's own
// accelerator is unreliable once autoHideMenuBar has hidden it).
function addFullscreenKey(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

const baseWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: path.join(__dirname, 'preload.cjs'),
};

function focusWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 760,
    minHeight: 560,
    title: 'Arabic Reader',
    backgroundColor: '#faf7f2',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences,
  });
  mainWindow = win;
  windowRegistry.add(win.id, 'main', 'Arabic Reader');
  addFullscreenKey(win);
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    windowRegistry.remove(win.id);
  });
  win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

/** Brings the main window up (making it if there is none) and returns it. */
function showMainWindow() {
  const win = createWindow();
  focusWindow(win);
  return win;
}

/**
 * A light window: the reader alone. `route` is the hash after `#/window/`. About 960 x 1100, smaller when the screen
 * is, each one offset a little from the last; it shows only once drawn, so there is no white flash.
 */
function createLightWindow(route, title, filePath) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(960, area.width);
  const height = Math.min(1100, area.height);
  const step = (windowRegistry.lightCount() % 8) * 28;
  const win = new BrowserWindow({
    width,
    height,
    x: Math.max(area.x, Math.min(area.x + Math.round((area.width - width) / 2) + step, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(area.y + Math.round((area.height - height) / 2) + step, area.y + area.height - height)),
    minWidth: 480,
    minHeight: 400,
    title,
    show: false,
    backgroundColor: '#faf7f2',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences,
  });
  windowRegistry.add(win.id, 'light', title);
  if (filePath) pathOfWindow.set(win.id, filePath);
  addFullscreenKey(win);
  // The page's own <title> would replace the book's title; the book sets it through windows:set-book.
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    pathOfWindow.delete(win.id);
    windowRegistry.remove(win.id);
  });
  win.loadURL(`${APP_ORIGIN}/#/window/${route}`);
  return win;
}

const sameFile = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Opens a PDF or EPUB in a light window, or focuses the window that already has that file. */
function openFileInLightWindow(file) {
  const full = path.resolve(file);
  for (const [id, open] of pathOfWindow) {
    if (!sameFile(open, full)) continue;
    const existing = BrowserWindow.fromId(id);
    if (existing && !existing.isDestroyed()) return focusWindow(existing);
  }
  createLightWindow(encodeURIComponent(diskFiles().register(full)), path.basename(full), full);
}

/** Opens a book already in the library in a light window, or focuses the window that shows it. */
function openBookInLightWindow(bookId) {
  const existing = windowRegistry.findByBook(bookId);
  if (existing) return focusWindow(BrowserWindow.fromId(existing.id));
  createLightWindow(`book/${encodeURIComponent(bookId)}`, 'Arabic Reader');
}

// MOBI, AZW3, TXT and Markdown need converting, so the main window imports them the ordinary way: it is told here
// and takes the tokens (files:take-imports), so nothing is lost if its page is still loading.
const pendingImports = [];
function queueImports(files) {
  if (files.length === 0) return;
  for (const file of files) pendingImports.push(diskFiles().register(file));
  const win = showMainWindow();
  if (!win.webContents.isLoading()) win.webContents.send('files:imports-available');
}

/** Files the OS or the dialog handed us: in-place formats get their own windows, the rest go to the main window. */
function openPaths(files) {
  const inPlace = files.filter(isInPlaceExt);
  for (const file of inPlace) openFileInLightWindow(file);
  queueImports(files.filter((file) => !isInPlaceExt(file)));
}

// Applies to every WebContents the app ever creates, not just the first window.
app.on('web-contents-created', (_event, contents) => {
  // New-window requests (target="_blank" links) open in the real browser --
  // but only for http(s): openExternal on arbitrary schemes can launch local
  // programs.
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// --- Sync folder -------------------------------------------------------------
// The folder is chosen through the system picker and remembered here, in the
// main process. The renderer only ever passes `<deviceId>/<file>.json` names.
const syncConfigPath = () => path.join(app.getPath('userData'), 'sync-folder.json');
let syncRoot = null;

async function loadSyncRoot() {
  try {
    syncRoot = JSON.parse(await fs.readFile(syncConfigPath(), 'utf8')).path || null;
  } catch {
    syncRoot = null;
  }
}

async function saveSyncRoot(folder) {
  syncRoot = folder;
  await fs.writeFile(syncConfigPath(), JSON.stringify({ path: folder }), 'utf8');
}

const syncFolder = createSyncFolder({ getRoot: () => syncRoot });

// Only the app's own window may use these; anything else (other frames) is refused.
function fromAppWindow(event) {
  return event.senderFrame && event.senderFrame.url.startsWith(`${APP_ORIGIN}/`);
}

function handleSync(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromAppWindow(event)) throw new Error('Not allowed.');
    return fn(event, ...args);
  });
}

// --- Window ------------------------------------------------------------------
const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);
handleSync('window:set-fullscreen', (event, on) => windowOf(event)?.setFullScreen(Boolean(on)));
handleSync('window:toggle-fullscreen', (event) => {
  const win = windowOf(event);
  win?.setFullScreen(!win.isFullScreen());
});

handleSync('sync-folder:get', () => syncRoot);
handleSync('sync-folder:choose', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(window, {
    title: 'Choose a folder to sync through',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  await saveSyncRoot(result.filePaths[0]);
  return syncRoot;
});
handleSync('sync-folder:clear', () => saveSyncRoot(null));
handleSync('sync-folder:list', () => syncFolder.list());
handleSync('sync-folder:read', (_event, rel) => syncFolder.read(rel));
handleSync('sync-folder:write', (_event, rel, text) => syncFolder.write(rel, text));
handleSync('sync-folder:remove', (_event, rel) => syncFolder.remove(rel));

// --- BlobStore files -----------------------------------------------------------
// Book files and other large bytes (src/blobStore), under a folder the app owns.
// The renderer names a blob by its SHA-256 only; blobFiles.cjs refuses anything else.
let blobFiles = null;
const blobs = () => (blobFiles ??= createBlobFiles({ root: path.join(app.getPath('userData'), 'blobs') }));
handleSync('blobs:write', (_event, hash, bytes) => blobs().write(hash, bytes));
handleSync('blobs:read', (_event, hash) => blobs().read(hash));
handleSync('blobs:has', (_event, hash) => blobs().has(hash));
handleSync('blobs:remove', (_event, hash) => blobs().remove(hash));
handleSync('blobs:list', () => blobs().list());

// --- Text recognition for scanned PDF pages ----------------------------------------------------------------
// The engines the OS provides, and a post to an address the reader added (src/pdf/ocr). The PowerShell
// worker cannot run from inside the asar archive, so it is unpacked next to it.
let ocrEngines = null;
const ocr = () =>
  (ocrEngines ??= createOcrEngines({
    scriptPath: path.join(__dirname, 'windows-ocr.ps1').replace('app.asar', 'app.asar.unpacked'),
    tmpDir: app.getPath('temp'),
  }));
handleSync('ocr:list', () => ocr().list());
handleSync('ocr:recognize', (_event, id, bytes, language) => ocr().recognize(id, bytes, language));
handleSync('ocr:http', (_event, url, bytes, language) => ocr().http(url, bytes, language));
app.on('will-quit', () => ocrEngines?.dispose());

// --- Files opened in place ------------------------------------------------------
// A file the OS handed us (double-click, Open with) or the reader chose in a dialog is named by an opaque token;
// one seen before is found again by its hash. See diskFiles.cjs. The renderer never gets a path to read from.
let diskFilesStore = null;
const diskFiles = () => (diskFilesStore ??= createDiskFiles({ userDataDir: app.getPath('userData') }));

const bookFilters = [
  { name: 'Books', extensions: BOOK_EXTS.map((ext) => ext.slice(1)) },
  { name: 'All files', extensions: ['*'] },
];

handleSync('files:describe', (_event, token) => diskFiles().describe(token));
handleSync('files:read', (_event, token) => diskFiles().read(token));
handleSync('files:read-by-hash', (_event, hash) => diskFiles().readByHash(hash));
handleSync('files:has', (_event, hash) => diskFiles().has(hash));
handleSync('files:open', async (event) => {
  const result = await dialog.showOpenDialog(windowOf(event), {
    title: 'Open a book',
    properties: ['openFile', 'multiSelections'],
    filters: bookFilters,
  });
  if (result.canceled) return 0;
  openPaths(result.filePaths);
  return result.filePaths.length;
});
// 'found' when the chosen file has the hash and is now remembered; 'different' when it is another file.
handleSync('files:locate', async (event, hash) => {
  const result = await dialog.showOpenDialog(windowOf(event), {
    title: 'Find the file',
    properties: ['openFile'],
    filters: bookFilters,
  });
  if (result.canceled || result.filePaths.length === 0) return 'cancelled';
  return (await diskFiles().locate(hash, result.filePaths[0])) ? 'found' : 'different';
});
handleSync('files:take-imports', () => pendingImports.splice(0).filter((token) => diskFiles().pathOfToken(token)));

// --- Windows (the list, and who shows what) ---------------------------------------
const broadcastWindows = (list) => {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('windows:changed', list);
};
windowRegistry.onChange(broadcastWindows);

handleSync('windows:open-book', (_event, bookId) => {
  if (typeof bookId !== 'string' || bookId === '') throw new Error('Invalid book.');
  openBookInLightWindow(bookId);
});
handleSync('windows:open-library', () => {
  showMainWindow();
});
handleSync('windows:focus', (_event, windowId) => {
  const win = BrowserWindow.fromId(Number(windowId));
  if (win && windowRegistry.list().some((entry) => entry.id === win.id)) focusWindow(win);
});
handleSync('windows:list', () => windowRegistry.list());
// Each window reports the book it shows. If a light window turns out to show a book another light window already
// has (a file opened that is the same book as one opened from the Library), the older window comes forward and this
// one closes.
handleSync('windows:set-book', (event, bookId, title) => {
  const win = windowOf(event);
  if (!win) return;
  const entry = windowRegistry.list().find((e) => e.id === win.id);
  if (bookId && entry?.kind === 'light') {
    const other = windowRegistry.findByBook(bookId, win.id);
    if (other) {
      focusWindow(BrowserWindow.fromId(other.id));
      win.close();
      return;
    }
  }
  windowRegistry.setBook(win.id, bookId, title);
  if (entry?.kind === 'light' && title) win.setTitle(title);
});

// --- Starting, and starting again ---------------------------------------------------
// One running copy only: a second launch (a double-clicked file while the app is open) hands its command line to
// the first, which opens the file in a new window at once. macOS delivers files as `open-file` instead, which can
// arrive before the app is ready, so those wait in `pendingPaths`.
const gotLock = app.requestSingleInstanceLock();
let appReady = false;
const pendingPaths = pickOpenablePaths(process.argv.slice(1), { appPath: process.execPath });

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const files = pickOpenablePaths(argv.slice(1), { cwd: workingDirectory, appPath: process.execPath });
    if (files.length > 0) openPaths(files);
    else showMainWindow();
  });

  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (appReady) openPaths([file]);
    else pendingPaths.push(file);
  });

  app.whenReady().then(async () => {
    await loadSyncRoot();
    protocol.handle(APP_SCHEME, serveAppRequest);
    // Only fullscreen (Speed Reader) is ever needed; deny everything else.
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'fullscreen');
    });
    appReady = true;
    // Started with files: only their windows open (no Library behind them). Library opens from any of them.
    if (pendingPaths.length > 0) openPaths(pendingPaths.splice(0));
    else createWindow();
    // Nothing opened (files that no longer exist, say): fall back to the main window.
    if (windowRegistry.count() === 0) createWindow();
    startAutoUpdate();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
