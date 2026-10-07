/// <reference lib="webworker" />
import { sha256HexHere } from './hash';

// Hashes one Blob off the main thread (see sha256Hex in hash.ts).
self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    self.postMessage({ hash: await sha256HexHere(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
