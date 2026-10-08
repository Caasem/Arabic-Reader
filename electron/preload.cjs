// Preload for the main window (sandboxed). Exposes a small, fixed API: folder
// access for sync, BlobStore files by hash, nothing else. All path checking happens in the main process.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('arabicReaderDesktop', {
  window: {
    /** True OS fullscreen: hides the title bar and borders, unlike the web Fullscreen API in a window. */
    setFullScreen: (on) => call('window:set-fullscreen', Boolean(on)),
    toggleFullScreen: () => call('window:toggle-fullscreen'),
  },
  syncFolder: {
    /** The chosen folder's path, or null. Shown to the user; never used to read files. */
    get: () => call('sync-folder:get'),
    /** Opens the system folder picker. Resolves to the chosen path, or null if cancelled. */
    choose: () => call('sync-folder:choose'),
    clear: () => call('sync-folder:clear'),
    list: () => call('sync-folder:list'),
    read: (rel) => call('sync-folder:read', rel),
    write: (rel, text) => call('sync-folder:write', rel, text),
    remove: (rel) => call('sync-folder:remove', rel),
  },
  /** Text recognition for scanned PDF pages: the OS's engines, and a post to an address the reader added. */
  ocr: {
    list: () => call('ocr:list'),
    recognize: (id, bytes, language) => call('ocr:recognize', id, bytes, language),
    http: (url, bytes, language) => call('ocr:http', url, bytes, language),
  },
  /** BlobStore bytes as files under the app's user-data folder, named by SHA-256 only. */
  blobs: {
    write: (hash, bytes) => call('blobs:write', hash, bytes),
    read: (hash) => call('blobs:read', hash),
    has: (hash) => call('blobs:has', hash),
    remove: (hash) => call('blobs:remove', hash),
    list: () => call('blobs:list'),
  },
});
