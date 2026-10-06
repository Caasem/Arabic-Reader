// Preload for the main window (sandboxed). Exposes a small, fixed API: folder
// access for sync, nothing else. All path checking happens in the main process.
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
});
