import { useEffect, useSyncExternalStore } from 'react';
import type { GsState } from './progress';
import { loadSeedCounts } from './seed';
import { gettingStartedStore } from './store';

/** The checklist state, live. `seedNow` fills it once from existing data (the Library does this on first mount). */
export function useGettingStarted(seedNow = false): GsState {
  const state = useSyncExternalStore(gettingStartedStore.subscribe, gettingStartedStore.get);
  const seeded = state.seeded;
  useEffect(() => {
    if (!seedNow || seeded) return;
    let cancelled = false;
    loadSeedCounts()
      .then((c) => !cancelled && gettingStartedStore.seed(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [seedNow, seeded]);
  return state;
}
