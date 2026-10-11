import type { ReaderPreferences } from '../types';

/**
 * One-time changes to stored preferences. Each migration runs once per set of
 * preferences, in order: `prefsMigrations` (stored with the preferences, so it
 * syncs with them) counts how many have run. To add one, append it here; never
 * edit or reorder one that has shipped.
 */
type Migration = (prefs: ReaderPreferences) => ReaderPreferences;

const MIGRATIONS: Migration[] = [
  // 1 (0.95.0): moved everyone to the new reader, with a notice that could switch back. Since 0.96.0 it is the only
  // reader and those settings are gone, so there is nothing left to change; the slot stays so the count stays right.
  (prefs) => prefs,
];

export const PREFS_MIGRATIONS_VERSION = MIGRATIONS.length;

/** Runs the migrations these preferences haven't had yet. Returns the same object when there are none. */
export function migratePreferences(prefs: ReaderPreferences): ReaderPreferences {
  const done = Math.max(0, Math.floor(prefs.prefsMigrations) || 0);
  if (done >= MIGRATIONS.length) return prefs;
  let next = prefs;
  for (const migrate of MIGRATIONS.slice(done)) next = migrate(next);
  return { ...next, prefsMigrations: MIGRATIONS.length };
}
