import Dexie, { type Table } from 'dexie';

/**
 * Persists only the user's opt-in choice for the vocabulary-rarity feature
 * (see `public/frequency-data/CAMEL-NOTICE.txt` for the dataset's license —
 * CC BY-SA 4.0) — NOT the 11.4M-word dataset itself.
 *
 * An earlier version of this stored one IndexedDB row per word (11.4M
 * rows). Benchmarking that against this app's actual IndexedDB backend
 * measured ~3,600 row-writes/sec — 11.4M rows would take the better part
 * of an hour to ingest, which is not a reasonable "one-time" cost. Parsing
 * the same data into a single in-memory `Map` instead takes ~14 seconds
 * (see `frequencyIndex.ts`), so that's what actually backs lookups now;
 * this store just remembers whether the user has enabled the feature, so
 * Settings/the Vocabulary Levels panel don't ask again every session.
 */
interface MetaRow {
  id: 'default';
  enabledAt: number;
}

class FrequencyDB extends Dexie {
  meta!: Table<MetaRow, string>;
  constructor() {
    super('arabic-reader-frequency');
    this.version(1).stores({
      words: 'word', // legacy store from the per-row approach; dropped below
      meta: 'id',
    });
    // Drop the old (unused, potentially huge) per-word store if a previous
    // build of this app already created one on this device.
    this.version(2)
      .stores({ words: null, meta: 'id' })
      .upgrade(async (tx) => {
        await tx.table('words').clear();
      });
  }
}

const db = new FrequencyDB();

export async function isEnabled(): Promise<boolean> {
  return (await db.meta.get('default')) !== undefined;
}

export async function setEnabled(): Promise<void> {
  await db.meta.put({ id: 'default', enabledAt: Date.now() });
}

export async function setDisabled(): Promise<void> {
  await db.meta.clear();
}
