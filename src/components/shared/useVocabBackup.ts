import { useRef, useState } from 'react';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { recordBackupExported } from '../../backupReminder';
import type { BackupData } from '../../types';

/**
 * Export/import logic for the vocabulary + word-instance + highlight
 * backup (see Settings → Backup). Pulled out of SettingsPanel so the same
 * export/import buttons can appear in the Vocabulary and Review tabs too,
 * without three separate copies of this logic drifting apart over time —
 * all three call the exact same `vocabularyService.exportBackup()` /
 * `importBackup()` pair and produce byte-identical backup files.
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
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arabic-reader-backup-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      recordBackupExported();
      setStatus(
        `Exported ${data.vocabulary.length} vocabulary item${data.vocabulary.length === 1 ? '' : 's'}, ${data.highlights.length} highlight${data.highlights.length === 1 ? '' : 's'}.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await fileList[0].text();
      const data = JSON.parse(text) as BackupData;
      if (!data || typeof data !== 'object' || !Array.isArray(data.vocabulary)) {
        throw new Error('Not a recognizable backup file.');
      }
      const result = await vocabularyService.importBackup(data);
      setStatus(
        `Imported ${result.vocabulary} vocabulary item${result.vocabulary === 1 ? '' : 's'}, ${result.highlights} highlight${result.highlights === 1 ? '' : 's'}. A row with the same id as one you already had was overwritten by the imported version.`
      );
    } catch (e) {
      setStatus(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed: not a valid backup file.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return { status, busy, exportBackup, importBackup, fileInputRef };
}
