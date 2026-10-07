import { sha256Hex } from '../blobStore/hash';
import { PackError } from './types';

/** Files above this are fetched in ranges of this size, each kept as it arrives so a killed app resumes. */
export const RANGE_THRESHOLD = 4 * 1024 * 1024;
export const RANGE_SIZE = 4 * 1024 * 1024;

/** Where finished ranges are kept between runs (the `packParts` table in the app; a Map in tests). */
export interface PartStore {
  get(hash: string, index: number): Promise<Blob | undefined>;
  put(hash: string, index: number, data: Blob): Promise<void>;
  clear(hash: string): Promise<void>;
}

export interface DownloadOptions {
  url: string;
  /** What the manifest promises: the file is accepted only if it has exactly this SHA-256 and size. */
  hash: string;
  size: number;
  parts: PartStore;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Bytes now held for this file (finished ranges plus the one just completed). */
  onProgress?: (bytes: number) => void;
  rangeSize?: number;
  rangeThreshold?: number;
}

/**
 * Requests carry nothing that identifies the reader: no cookies, no referrer, no headers but `Range`
 * (a CORS-safelisted one for a single byte range).
 */
function request(fetchImpl: typeof fetch, url: string, signal: AbortSignal | undefined, range?: string): Promise<Response> {
  return fetchImpl(url, {
    method: 'GET',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal,
    ...(range ? { headers: { Range: range } } : {}),
  });
}

function networkError(error: unknown, signal?: AbortSignal): PackError {
  if (signal?.aborted) return new PackError('aborted', 'The download was cancelled.', { cause: error });
  return new PackError('offline', 'The download failed: no connection.', { cause: error });
}

async function body(response: Response, expected: number, signal: AbortSignal | undefined): Promise<Blob> {
  let data: Blob;
  try {
    data = await response.blob();
  } catch (error) {
    throw networkError(error, signal);
  }
  // A connection that closed early gives fewer bytes than promised: keep nothing of it.
  if (data.size !== expected) throw new PackError('offline', 'The download was cut short.');
  return data;
}

/**
 * Downloads one pack file and returns its bytes once they are proven to be the file the manifest names. Range
 * boundaries come from the manifest's size, so a resumed run asks only for the ranges it does not already hold.
 * A file that fails its hash is discarded with its ranges, and throws a 'verification' error.
 */
export async function downloadFile(options: DownloadOptions): Promise<Blob> {
  const { url, hash, size, parts, signal } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const rangeSize = options.rangeSize ?? RANGE_SIZE;
  const threshold = options.rangeThreshold ?? RANGE_THRESHOLD;
  const report = options.onProgress ?? (() => undefined);

  let whole: Blob;
  if (size <= threshold) {
    const response = await request(fetchImpl, url, signal).catch((e: unknown) => {
      throw networkError(e, signal);
    });
    if (!response.ok) throw new PackError('offline', `The download failed (${response.status}).`);
    whole = await body(response, size, signal);
    report(size);
  } else {
    const count = Math.ceil(size / rangeSize);
    const held: Blob[] = [];
    let have = 0;
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new PackError('aborted', 'The download was cancelled.');
      const start = i * rangeSize;
      const end = Math.min(start + rangeSize, size) - 1;
      const expected = end - start + 1;
      let part = await parts.get(hash, i);
      if (part && part.size !== expected) part = undefined; // damaged leftovers: fetch it again
      if (!part) {
        const response = await request(fetchImpl, url, signal, `bytes=${start}-${end}`).catch((e: unknown) => {
          throw networkError(e, signal);
        });
        if (response.status === 200) {
          // The host ignored the range and sent the whole file: use it, and stop asking for ranges.
          whole = await body(response, size, signal);
          await parts.clear(hash);
          report(size);
          return verified(whole, hash, size);
        }
        if (response.status !== 206) throw new PackError('offline', `The download failed (${response.status}).`);
        part = await body(response, expected, signal);
        await parts.put(hash, i, part);
      }
      held.push(part);
      have += part.size;
      report(have);
    }
    whole = new Blob(held);
  }

  try {
    return await verified(whole, hash, size);
  } finally {
    await parts.clear(hash);
  }
}

async function verified(data: Blob, hash: string, size: number): Promise<Blob> {
  if (data.size !== size || (await sha256Hex(data)) !== hash) {
    throw new PackError('verification', 'Verification failed: the file was damaged. It will be downloaded again.');
  }
  return data;
}
