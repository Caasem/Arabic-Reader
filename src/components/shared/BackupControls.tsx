import { useVocabBackup } from './useVocabBackup';
import './BackupControls.css';

/**
 * Reusable "Export backup" / "Import backup" buttons + status line — used
 * in Settings → Backup (the original home for this), and now also in the
 * Vocabulary and Review tabs, so a backup can be made or restored right
 * where the vocabulary itself lives rather than only from Settings.
 */
export function BackupControls({ compact = false }: { compact?: boolean }) {
  const { status, busy, exportBackup, importBackup, fileInputRef } = useVocabBackup();

  return (
    <div className={'backup-controls' + (compact ? ' backup-controls--compact' : '')}>
      <div className="backup-controls__actions">
        <button className="btn btn--ghost" onClick={exportBackup} disabled={busy}>
          {busy ? 'Working…' : 'Export backup'}
        </button>
        <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Import backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => importBackup(e.target.files)}
        />
      </div>
      {status && <p className="backup-controls__status">{status}</p>}
    </div>
  );
}
