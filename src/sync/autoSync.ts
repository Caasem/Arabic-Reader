import { onLocalSyncChange } from '../persistence/changeSignal';
import { logDiagnostic } from '../diagnostics/diagnosticsLog';
import { getSyncFolderBridge } from './desktopBridge';
import { readFolderSyncStatus, runFolderSync } from './folderSync';
import { createSyncScheduler, type SchedulerState } from './scheduler';

/**
 * Automatic folder sync for the desktop app: wires the scheduler to the app
 * (local changes, opening, coming online, the window being hidden or shown).
 * Folder sync only exists in the desktop app, so everywhere else this does nothing.
 */

/** While the window is visible, look for other devices' changes this often. */
const POLL_MS = 5 * 60_000;

type Scheduler = ReturnType<typeof createSyncScheduler>;

let active: { scheduler: Scheduler; stop(): void } | null = null;

/** Starts automatic sync once; later calls do nothing. Safe to call before sync is switched on. */
export function startAutoSync(): void {
  if (active || !getSyncFolderBridge()) return;

  const scheduler = createSyncScheduler({
    run: async (reason) => {
      try {
        await runFolderSync();
      } catch (error) {
        logDiagnostic('warn', 'sync', `Automatic sync (${reason}) failed`, error);
        throw error;
      }
    },
    // Re-checked before every run, so switching sync on later needs no restart.
    isEnabled: async () => {
      const status = await readFolderSyncStatus();
      return status.enabled && status.folder !== null;
    },
    pollMs: POLL_MS,
    isVisible: () => document.visibilityState === 'visible',
  });

  const stopChanges = onLocalSyncChange(() => scheduler.notifyChange());
  // Best-effort: the OS may end the app before this finishes, so nothing depends on it.
  const onVisibility = () => scheduler.trigger(document.visibilityState === 'hidden' ? 'background' : 'poll');
  const onPageHide = () => scheduler.trigger('background');
  const onOnline = () => scheduler.trigger('online');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('online', onOnline);

  active = {
    scheduler,
    stop() {
      stopChanges();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      scheduler.dispose();
    },
  };
  scheduler.trigger('open');
}

export function stopAutoSync(): void {
  active?.stop();
  active = null;
}

/** For the Settings screen: the running scheduler's state, or null when automatic sync isn't running. */
export function subscribeAutoSync(listener: (state: SchedulerState | null) => void): () => void {
  if (!active) {
    listener(null);
    return () => {};
  }
  listener(active.scheduler.getState());
  return active.scheduler.subscribe(listener);
}
