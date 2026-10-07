/** Files above this are hashed in a worker so the reader's UI stays responsive. */
export const WORKER_HASH_THRESHOLD = 8 * 1024 * 1024;

const toHex = (digest: ArrayBuffer): string =>
  Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 of the bytes, lowercase hex, on this thread. */
export async function sha256HexHere(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  return toHex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
}

function hashInWorker(data: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<{ hash?: string; error?: string }>) => {
      done();
      if (event.data.hash) resolve(event.data.hash);
      else reject(new Error(event.data.error ?? 'Hashing failed.'));
    };
    worker.onerror = (event) => {
      done();
      reject(new Error(event.message || 'Hashing worker failed.'));
    };
    worker.postMessage(data);
  });
}

/**
 * SHA-256 of the bytes, lowercase hex. Large Blobs go to a worker when one is
 * available; if the worker cannot start, the hash is computed here instead.
 */
export async function sha256Hex(data: Blob | Uint8Array): Promise<string> {
  if (data instanceof Blob && data.size > WORKER_HASH_THRESHOLD && typeof Worker !== 'undefined') {
    try {
      return await hashInWorker(data);
    } catch {
      // Fall through: same result, only slower for the UI.
    }
  }
  return sha256HexHere(data);
}
