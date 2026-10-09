// Self-update for the installed (NSIS) desktop app, from the GitHub Releases
// the release-desktop workflow publishes. A new version downloads quietly in
// the background and installs when the app is next closed; the reader is never
// interrupted. Dev runs (electron .) are not packaged, so they skip it.
const { app } = require('electron');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function startAutoUpdate() {
  if (!app.isPackaged) return;
  // Loaded lazily so a development checkout without the package still starts.
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // An update check failing (offline, rate limit) must never surface as a crash.
  autoUpdater.on('error', (error) => console.warn('Update check failed:', error?.message ?? error));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { startAutoUpdate };
