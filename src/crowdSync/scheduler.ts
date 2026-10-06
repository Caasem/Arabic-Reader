import { isSharingOn } from './consent';
import { refreshManifest } from './packStore';
import { flushQueue } from './sender';
import { loadState } from './state';
import { CLIENT_LIMITS } from './types';

let timer: ReturnType<typeof setTimeout> | undefined;
let backoffMs = 0;

/** Sends the queue soon, once, however many votes are queued in the next few seconds. */
export function requestFlush(delay: number = CLIENT_LIMITS.flushDebounceMs): void {
  if (!isSharingOn()) return;
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      void flushQueue().then((r) => {
        // Back off after a failure (up to an hour); reset after a success.
        backoffMs = r.status === 'offline' || r.status === 'error' ? Math.min(CLIENT_LIMITS.hourMs, Math.max(30_000, backoffMs * 2)) : 0;
        if (backoffMs) requestFlush(backoffMs);
      });
    },
    delay,
  );
}

async function refreshIfDue(): Promise<void> {
  if (!isSharingOn()) return;
  const state = await loadState();
  const due = !state.manifest || Date.now() - (state.lastManifestCheckAt ?? 0) >= CLIENT_LIMITS.manifestCheckMs;
  if (due) await refreshManifest();
}

/**
 * Starts the background work while the app is open: send what is queued, check the manifest once a day, and try
 * again when the device comes back online and every hour. Returns a function that stops it all.
 */
export function startCrowdSync(): () => void {
  const tick = () => {
    if (!isSharingOn()) return;
    void refreshIfDue();
    requestFlush(0);
  };
  const first = setTimeout(tick, 10_000);
  const interval = setInterval(tick, CLIENT_LIMITS.hourMs);
  const online = () => tick();
  globalThis.addEventListener?.('online', online);
  return () => {
    clearTimeout(first);
    clearTimeout(timer);
    clearInterval(interval);
    globalThis.removeEventListener?.('online', online);
  };
}
