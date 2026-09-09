import Dexie, { type Table } from 'dexie';

/**
 * Persists only the user's opt-in choice for the vocabulary-rarity feature
 * — the actual word list ("The List", ~5,300 entries) is embedded directly
 * into the bundle (see `frequencyIndex.ts`), not stored here.
 *
 * This used to back a much larger dataset (the CAMeL Arabic Frequency
 * Lists, 11.4M words) where per-row IndexedDB storage was benchmarked as
 * impractical (~3,600 writes/sec would've taken the better part of an
 * hour) and even an in-memory Map took ~14 seconds to build each session.
 * Neither concern applies to a list this size, but the opt-in flag itself
 * is unchanged: Settings/the Vocabulary Levels panel still just check
 * whether the user has enabled the feature, so they don't ask again every
 * session.
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
