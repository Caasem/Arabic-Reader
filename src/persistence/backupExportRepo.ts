import type { BackupData } from '../types';
import { db } from './schema';
import { getAllWordInstances, upsertWordInstancesBulk } from './wordInstancesRepo';
import { bulkPutSynced, syncScope } from './writeLayer';

/** Backup / restore (put semantics: incoming rows overwrite same-id rows). */
export async function exportBackup(): Promise<BackupData> {
  const [vocabulary, wordInstances, highlights] = await Promise.all([
    db.vocabulary.toArray(),
    getAllWordInstances(),
    db.highlights.toArray(),
  ]);
  return { formatVersion: 1, exportedAt: Date.now(), vocabulary, wordInstances, highlights };
}

export async function importBackup(
  data: BackupData,
): Promise<{ vocabulary: number; wordInstances: number; highlights: number }> {
  await db.transaction('rw', [db.wordInstances, ...syncScope('vocabulary', 'highlights')], async () => {
    await bulkPutSynced('vocabulary', data.vocabulary);
    if (data.wordInstances.length) await upsertWordInstancesBulk(data.wordInstances);
    await bulkPutSynced('highlights', data.highlights);
  });
  return {
    vocabulary: data.vocabulary.length,
    wordInstances: data.wordInstances.length,
    highlights: data.highlights.length,
  };
}
