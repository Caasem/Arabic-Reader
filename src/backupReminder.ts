/**
 * Tracks "when did the user last exported a backup" purely as a UI nudge —
 * everything here is disposable browser-local state (localStorage, not
 * IndexedDB), so losing it just means the reminder banner might show up
 * again sooner than strictly necessary, never a real data-loss risk.
 *
 * This exists because the app has no cloud sync: vocabulary, reading
 * progress, and highlights live only in this one browser's IndexedDB.
 * `Settings → Backup` already lets someone export/import a JSON snapshot,
 * but nothing prompts them to actually do it before it's too late (browser
 * data cleared, a new device, iOS Safari's ~7-day IndexedDB eviction for
 * sites not added to the home screen) — see `BackupReminder.tsx`.
 */

const LAST_BACKUP_KEY = 'arabic-reader:lastBackupAt';
const DISMISSED_KEY = 'arabic-reader:backupReminderDismissedAt';

function readTimestamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // private browsing / storage disabled — fail quiet, no reminder rather than a crash
  }
}

function writeTimestamp(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // best-effort only
  }
}

export function recordBackupExported(): void {
  writeTimestamp(LAST_BACKUP_KEY, Date.now());
}

export function getLastBackupAt(): number | null {
  return readTimestamp(LAST_BACKUP_KEY);
}

export function dismissBackupReminder(): void {
  writeTimestamp(DISMISSED_KEY, Date.now());
}

export function getReminderDismissedAt(): number | null {
  return readTimestamp(DISMISSED_KEY);
}
