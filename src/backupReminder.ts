/**
 * When the user last exported a backup, purely as a UI nudge. The app has
 * no cloud sync, so vocabulary, progress, and highlights live only in this
 * browser's IndexedDB -- which can be cleared, left behind on another
 * device, or evicted by iOS Safari (~7 days for sites not added to the home
 * screen). Losing these timestamps only means the reminder may show sooner.
 * See BackupReminder.tsx.
 */
import { readString, STORAGE_KEYS, writeString } from './utils/storage';

function readTimestamp(key: string): number | null {
  const raw = readString(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function recordBackupExported(): void {
  writeString(STORAGE_KEYS.lastBackupAt, String(Date.now()));
}

export function getLastBackupAt(): number | null {
  return readTimestamp(STORAGE_KEYS.lastBackupAt);
}

export function dismissBackupReminder(): void {
  writeString(STORAGE_KEYS.backupReminderDismissedAt, String(Date.now()));
}

export function getReminderDismissedAt(): number | null {
  return readTimestamp(STORAGE_KEYS.backupReminderDismissedAt);
}
