import { useEffect } from 'react';
import { startAutoSync, stopAutoSync } from './autoSync';

/** Mounted once in App. Starts automatic folder sync (desktop app only; a no-op elsewhere). */
export function AutoSync() {
  useEffect(() => {
    startAutoSync();
    return stopAutoSync;
  }, []);
  return null;
}
