import { useRef, useState } from 'react';
import { vocabularyService } from '../../vocabulary';
import { recordBackupExported } from '../../backupReminder';
import { BackupFormatError, parseBackup } from '../../persistence/backup';
import { saveFile } from '../../utils/saveFile';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * Export/import of the vocabulary + word-instance + highlight backup, shared
 * by Settings, Vocabulary, and Review so all three produce identical files.
 */
export function useVocabBackup() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setBusy(true);
    setStatus(null);
    try {
      const data = await vocabularyService.exportBackup();
      const filename = `arabic-reader-backup-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json`;
      const outcome = await saveFile(filename, JSON.stringify(data, null, 2), 'application/json');
      if (outcome === 'cancelled') return;
      recordBackupExported();
      setStatus(`Exported ${plural(data.vocabulary.length, 'vocabulary item')}, ${plural(data.highlights.length, 'highlight')}.`);
    } catch (e) {
      setStatus(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const { data, skipped } = parseBackup(JSON.parse(await fileList[0].text()));
      const result = await vocabularyService.importBackup(data);
      setStatus(
        `Imported ${plural(result.vocabulary, 'vocabulary item')}, ${plural(result.highlights, 'highlight')}.` +
          (skipped ? ` Skipped ${plural(skipped, 'invalid row')}.` : '') +
          ' Items with the same id as ones you already had were replaced.'
      );
    } catch (e) {
      const reason = e instanceof BackupFormatError ? e.message : 'not a valid backup file.';
      setStatus(`Import failed: ${reason}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return { status, busy, exportBackup, importBackup, fileInputRef };
}
