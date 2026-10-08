import { createEndpointEngine, loadDesktopEngines } from './engines';
import { registerOcrEngine, ocrEngines, unregisterOcrEngine } from './registry';
import { getOcrSettings, subscribeOcrSettings } from './settings';

let started = false;

/** Keeps the registry's reader-added engines in step with the saved list. */
function syncCustomEngines() {
  const wanted = getOcrSettings().custom;
  const ids = new Set(wanted.map((c) => c.id));
  for (const engine of ocrEngines()) if (engine.kind === 'custom' && !ids.has(engine.id)) unregisterOcrEngine(engine.id);
  for (const config of wanted) {
    const existing = ocrEngines().find((e) => e.id === config.id);
    if (!existing || existing.name !== config.name || existing.description !== config.url) registerOcrEngine(createEndpointEngine(config));
  }
}

/** Registers the engines that exist on this device. Safe to call from anywhere, any number of times. */
export function initOcr(): void {
  if (started) return;
  started = true;
  syncCustomEngines();
  subscribeOcrSettings(syncCustomEngines);
  void loadDesktopEngines().then((engines) => {
    // The OS's engines go ahead of the reader's own so the default stays the built-in one.
    const custom = ocrEngines().filter((e) => e.kind === 'custom');
    for (const engine of custom) unregisterOcrEngine(engine.id);
    for (const engine of engines) registerOcrEngine(engine);
    for (const engine of custom) registerOcrEngine(engine);
  });
}
