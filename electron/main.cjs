// Electron main process (plain CommonJS -- simplest for Electron's entry
// point regardless of the rest of the project being ESM).
//
// The built app (dist/) is served from a privileged custom `app://bundle`
// scheme. That gives the app one fixed origin for the life of the install,
// which matters because IndexedDB/localStorage are scoped per origin: the
// previous approach (a local HTTP server on a random port) produced a new
// origin -- and therefore empty storage -- on every launch.
const { app, BrowserWindow, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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
// localhost:8765.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' blob: data: http://127.0.0.1:8765 http://localhost:8765",
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 760,
    minHeight: 560,
    title: 'Arabic Reader',
    backgroundColor: '#faf7f2',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(`${APP_ORIGIN}/`);
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

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, serveAppRequest);
  // Only fullscreen (Speed Reader) is ever needed; deny everything else.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'fullscreen');
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
