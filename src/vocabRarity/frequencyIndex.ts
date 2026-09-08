/**
 * The actual in-memory word→rank index — see `frequencyStore.ts` for why
 * this isn't backed by IndexedDB per-word rows. Built once per browser
 * session (module-level singleton promise, not per-component state) from
 * the bundled dataset, and kept in memory for the rest of the session —
 * the underlying static asset is browser-HTTP-cached after the first
 * fetch, but the decompress+parse+Map-build pass (~10-15s for 11.4M
 * words) still has to happen at least once per page load.
 */

export interface IngestProgress {
  linesProcessed: number;
  bytesProcessed: number;
}

interface FrequencyIndex {
  ranks: Map<string, number>;
  total: number;
}

let indexPromise: Promise<FrequencyIndex> | null = null;

async function build(onProgress?: (p: IngestProgress) => void): Promise<FrequencyIndex> {
  // See ingestFrequencyList's old comment (now here): `.gzbin`, not `.gz` —
  // a `.gz` extension gets served with `Content-Encoding: gzip` by most
  // static file servers (this project's included), which makes `fetch()`
  // transparently hand back already-decompressed bytes, breaking our own
  // manual `DecompressionStream('gzip')` below ("incorrect header check").
  const res = await fetch('/frequency-data/MSA_freq_lists.tsv.gzbin');
  if (!res.ok || !res.body) {
    throw new Error(`Could not fetch bundled frequency data (HTTP ${res.ok ? 'no body' : res.status})`);
  }

  // Buffered (not streamed) specifically so the gzip magic bytes can be
  // checked up front — this is the ~65MB *compressed* payload, trivial
  // next to the ~800MB the resulting Map ends up using, so there's no
  // real memory cost to holding it briefly. Catches the most common setup
  // mistake (see scripts/fetch-vocab-data.mjs) with a clear message
  // instead of DecompressionStream's opaque "incorrect header check".
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error(
      "The frequency data file isn't valid gzip data (wrong magic bytes) — it may have been renamed from a " +
        '.zip without actually being converted to gzip. Run `npm run setup:vocab-data` to fetch and prepare it ' +
        'automatically, or see SETUP-VOCAB-RARITY.md for manual steps.'
    );
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const ranks = new Map<string, number>();

  let carry = '';
  let rank = 0; // becomes 1-based on first increment
  let bytesProcessed = 0;
  let sinceLastProgress = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesProcessed += value.byteLength;
    carry += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    // eslint-disable-next-line no-cond-assign
    while ((newlineIdx = carry.indexOf('\n')) !== -1) {
      const line = carry.slice(0, newlineIdx);
      carry = carry.slice(newlineIdx + 1);
      const tab = line.indexOf('\t');
      if (tab === -1) continue; // blank/malformed line — skip rather than abort
      const word = line.slice(0, tab);
      if (!word) continue;
      rank++;
      ranks.set(word, rank);
    }

    sinceLastProgress++;
    if (sinceLastProgress >= 40) {
      // Yield to the event loop periodically (every ~40 stream chunks)
      // so the UI thread gets a chance to paint a progress update rather
      // than freezing solid for the full ~10-15s build.
      sinceLastProgress = 0;
      onProgress?.({ linesProcessed: rank, bytesProcessed });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const tail = carry.trim();
  if (tail) {
    const tab = tail.indexOf('\t');
    if (tab !== -1) {
      const word = tail.slice(0, tab);
      if (word) {
        rank++;
        ranks.set(word, rank);
      }
    }
  }

  onProgress?.({ linesProcessed: rank, bytesProcessed });
  return { ranks, total: rank };
}

/** Kicks off (or returns the in-flight/completed) index build for this
 * session. Safe to call from multiple places concurrently — they all
 * await the same underlying build rather than triggering duplicate work. */
export function getFrequencyIndex(onProgress?: (p: IngestProgress) => void): Promise<FrequencyIndex> {
  if (!indexPromise) {
    indexPromise = build(onProgress).catch((err) => {
      indexPromise = null; // allow retrying after a failure
      throw err;
    });
  }
  return indexPromise;
}

/** True once a build has completed (or is in progress) this session —
 * doesn't reflect whether the user has *opted in* (see
 * `frequencyStore.isEnabled` for that; the two are deliberately separate:
 * opting in is a persisted choice, having the index built is a
 * per-session fact). */
export function isFrequencyIndexBuilding(): boolean {
  return indexPromise !== null;
}
