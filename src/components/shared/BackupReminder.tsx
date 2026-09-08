import { useEffect, useState } from 'react';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { getLastBackupAt, getReminderDismissedAt, dismissBackupReminder } from '../../backupReminder';
import './BackupReminder.css';

/** Below this many saved words, losing everything is a minor annoyance,
 * not worth interrupting anyone over. */
const MIN_VOCAB_TO_NUDGE = 15;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
/** Once dismissed, stay quiet for a week rather than nagging every visit. */
const DISMISS_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A quiet, dismissible reminder that this app has no cloud sync — data
 * lives only in this browser's IndexedDB. Shows only once there's enough
 * saved vocabulary that losing it would actually sting, and only if a
 * backup hasn't been exported (ever, or recently) — see backupReminder.ts.
 */
export function BackupReminder({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    vocabularyService.list().then((items) => {
      if (cancelled) return;
      if (items.length < MIN_VOCAB_TO_NUDGE) return;

      const lastBackupAt = getLastBackupAt();
      const backedUpRecently = lastBackupAt !== null && Date.now() - lastBackupAt < FOURTEEN_DAYS_MS;
      if (backedUpRecently) return;

      const dismissedAt = getReminderDismissedAt();
      const dismissedRecently = dismissedAt !== null && Date.now() - dismissedAt < DISMISS_SNOOZE_MS;
      if (dismissedRecently) return;

      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  function dismiss() {
    dismissBackupReminder();
    setVisible(false);
  }

  return (
    <div className="backup-reminder" role="status">
      <span className="backup-reminder__text">
        Your vocabulary and progress live only in this browser — no account, no cloud sync. Worth exporting a
        backup.
      </span>
      <div className="backup-reminder__actions">
        <button
          className="backup-reminder__btn backup-reminder__btn--primary"
          onClick={() => {
            onOpenSettings();
            dismiss();
          }}
        >
          Back up now
        </button>
        <button className="backup-reminder__btn" onClick={dismiss} aria-label="Dismiss">
          Not now
        </button>
      </div>
    </div>
  );
}
