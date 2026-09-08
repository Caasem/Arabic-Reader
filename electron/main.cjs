// Electron main process. Deliberately plain CommonJS (`.cjs`) regardless of
// the rest of the project being ESM (`"type": "module"` in package.json) —
// Electron's main entry point is simplest kept as CJS so there's no
// ESM/CJS interop friction with `electron`/`electron-builder` itself.
//
// The app is served from a tiny local HTTP server rather than loaded via a
// `file://` URL. The Vite build (shared with the web deploy) uses root-
// relative asset paths ("/assets/…") and a PWA manifest with an absolute
// `start_url` — both of those resolve correctly against `http://` but
// would break against `file://`. Serving locally means the packaged app
// runs byte-for-byte the same built output the web deploy uses, no special
// Electron-only build config needed.
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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
  '.gzbin': 'application/octet-stream',
  '.epub': 'application/epub+zip',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';

      // Prevent escaping DIST_DIR via "../" — this only ever serves the
      // app's own bundled assets, but there's no reason to trust the path.
      const resolved = path.normalize(path.join(DIST_DIR, urlPath));
      if (!resolved.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(resolved, (err, data) => {
        if (err) {
          // SPA fallback: this app has no client-side routes today, but
          // falling back to index.html for an unmatched path is the
          // standard, harmless default for a single-page app server.
          fs.readFile(path.join(DIST_DIR, 'index.html'), (fallbackErr, fallbackData) => {
            if (fallbackErr) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
            res.end(fallbackData);
          });
          return;
        }
        const ext = path.extname(resolved);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
    server.on('error', reject);
  });
}

let mainWindow = null;

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
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

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  // Any link the app tries to open in a "new tab" (target="_blank" — e.g.
  // the AnkiConnect add-on link, the CAMeL Lab citation link in Settings)
  // should open in the user's real default browser, not a second Electron
  // window with no navigation chrome.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
