import { readJSON, STORAGE_KEYS, writeJSON } from '../utils/storage';
import { tourEvents } from './events';
import { applySeed, INITIAL, mark, normalise, startOver, type GsState, type SeedCounts } from './progress';

/**
 * The checklist's state: module-level, saved on this device only (no sync). It listens to tourEvents from the moment
 * the app loads, so an action done in the reader counts even though the Library is not mounted.
 */
let state: GsState = normalise(readJSON(STORAGE_KEYS.gettingStarted));
const subscribers = new Set<() => void>();

function set(next: GsState): void {
  if (next === state) return;
  state = next;
  writeJSON(STORAGE_KEYS.gettingStarted, state);
  subscribers.forEach((s) => s());
}

tourEvents.on((id) => set(mark(state, id)));

export const gettingStartedStore = {
  get: (): GsState => state,
  subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => void subscribers.delete(fn);
  },
  markDone: (id: string) => set(mark(state, id)),
  patch: (patch: Partial<GsState>) => set({ ...state, ...patch }),
  seed: (counts: SeedCounts) => set(applySeed(state, counts)),
  startOver: () => set(startOver()),
  /** Tests only. */
  reset: () => {
    state = INITIAL;
    subscribers.forEach((s) => s());
  },
};
