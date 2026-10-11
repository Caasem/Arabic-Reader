import type { ReaderPreferences } from '../types';

/**
 * One-time changes to stored preferences. Each migration runs once per set of
 * preferences, in order: `prefsMigrations` (stored with the preferences, so it
 * syncs with them) counts how many have run. To add one, append it here; never
 * edit or reorder one that has shipped.
 */
type Migration = (prefs: ReaderPreferences) => ReaderPreferences;

const MIGRATIONS: Migration[] = [
  // 1 (0.95.0): the new reader everywhere. Anyone with it off (by choice, or a phone or tablet set up before 0.95.0)
  // is moved to it, and the reader shows a one-time notice that can switch back until the old readers go (phase 2b).
  (prefs) =>
    prefs.quietReaderEnabled
      ? prefs
      : {
          ...prefs,
          quietReaderEnabled: true,
          cleanReaderEnabled: false,
          newReaderSwitchBack: { cleanReaderEnabled: prefs.cleanReaderEnabled },
        },
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
