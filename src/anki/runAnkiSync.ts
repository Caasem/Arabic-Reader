import { vocabularyService } from '../vocabulary';
import { describeReport, syncVocabularyToAnki } from './ankiSync';

/** One sync of every saved card with the given deck; returns the line shown to the reader. */
export async function runAnkiSync(options: { deck: string; removeDeleted: boolean; onProgress?: (done: number, total: number) => void }): Promise<string> {
  const items = await vocabularyService.list();
  const report = await syncVocabularyToAnki({
    deck: options.deck,
    items,
    removeDeleted: options.removeDeleted,
    save: (item, link) => vocabularyService.setAnkiLink(item, link),
    onProgress: options.onProgress,
  });
  return describeReport(report, options.deck);
}
