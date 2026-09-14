/**
 * localStorage access that never throws (private browsing, storage disabled,
 * quota). Only for small conveniences that may safely be lost -- anything
 * that must persist belongs in IndexedDB (see persistence/db.ts).
 */

/** Every key the app writes. Existing key strings are kept as-is so nobody
 * loses a remembered setting. */
export const STORAGE_KEYS = {
  preferencesMirror: 'arabic-reader:preferences',
  navbarCollapsed: 'navbar-collapsed',
  offlineNoticeDismissed: 'ar-reader-offline-notice-dismissed',
  searchHistory: 'ar-reader-search-history',
  lastBackupAt: 'arabic-reader:lastBackupAt',
  backupReminderDismissedAt: 'arabic-reader:backupReminderDismissedAt',
  pomodoroSnapshot: 'arabic-reader:pomodoroSnapshot',
  dashboardSectionCollapsedPrefix: 'dashboard-section-collapsed:',
  diagnosticsLog: 'arabic-reader:diagnostics',
} as const;

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort only
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort only
  }
}

export function readJSON<T>(key: string): T | null {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
