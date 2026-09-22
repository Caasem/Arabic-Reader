import type { VocabularyItem } from '../types';
import { addNotes, canAddNotes, type AnkiNote } from './ankiConnect';

const BATCH_SIZE = 50;

/** Anki note fields are HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toAnkiNote(deck: string, item: VocabularyItem): AnkiNote {
  const back = [item.meaning, item.sentence].filter(Boolean).map((part) => escapeHtml(part!)).join('<br><br>');
  return {
    deckName: deck,
    modelName: 'Basic',
    fields: { Front: escapeHtml(item.surfaceForm), Back: back },
    tags: ['arabic-reader'],
  };
}

export interface AnkiSyncResult {
  added: number;
  /** Rejected by Anki as duplicates of notes already in the collection. */
  alreadyInAnki: number;
  failed: number;
}

/**
 * Sends vocabulary to Anki in batches (two requests per batch rather than one
 * per word). Items that were added, or that Anki already has, are marked
 * synced so later syncs skip them; genuine failures are left for a retry.
 */
export async function syncToAnki(
  deck: string,
  items: VocabularyItem[],
  markSynced: (item: VocabularyItem) => Promise<unknown>
): Promise<AnkiSyncResult> {
  const result: AnkiSyncResult = { added: 0, alreadyInAnki: 0, failed: 0 };
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const notes = batch.map((item) => toAnkiNote(deck, item));
    const addable = await canAddNotes(notes);

    const toAdd = batch.filter((_, i) => addable[i]);
    const ids = toAdd.length ? await addNotes(notes.filter((_, i) => addable[i])) : [];

    for (let i = 0; i < batch.length; i++) {
      if (addable[i]) continue;
      result.alreadyInAnki++;
      await markSynced(batch[i]);
    }
    for (let i = 0; i < toAdd.length; i++) {
      if (ids[i] == null) {
        result.failed++;
      } else {
        result.added++;
        await markSynced(toAdd[i]);
      }
    }
  }
  return result;
}
