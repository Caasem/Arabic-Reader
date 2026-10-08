import type { OcrEngine } from './types';
import { getOcrSettings } from './settings';

const engines = new Map<string, OcrEngine>();
const listeners = new Set<() => void>();
let snapshot: OcrEngine[] = [];

function changed() {
  snapshot = [...engines.values()];
  for (const listener of listeners) listener();
}

/** Adds (or replaces) an engine; returns a function that removes it. This is how any engine gets in. */
export function registerOcrEngine(engine: OcrEngine): () => void {
  engines.set(engine.id, engine);
  changed();
  return () => unregisterOcrEngine(engine.id);
}

export function unregisterOcrEngine(id: string): void {
  if (engines.delete(id)) changed();
}

/** Every engine, in the order they were added (the app's and the OS's first, then the reader's own). */
export const ocrEngines = (): OcrEngine[] => snapshot;

export const getOcrEngine = (id: string): OcrEngine | undefined => engines.get(id);

export function subscribeOcrEngines(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The engine the reader chose, or else the first one that is not an address they added. */
export function chosenOcrEngine(): OcrEngine | undefined {
  const { engineId } = getOcrSettings();
  return (engineId ? engines.get(engineId) : undefined) ?? snapshot.find((e) => e.kind !== 'custom') ?? snapshot[0];
}
