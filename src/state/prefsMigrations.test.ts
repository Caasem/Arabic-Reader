import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, withDefaults } from './defaultPreferences';
import { migratePreferences, PREFS_MIGRATIONS_VERSION } from './prefsMigrations';

describe('migratePreferences', () => {
  it('treats preferences stored before migrations existed as version 0', () => {
    const stored = withDefaults({ fontSizePct: 120 });
    expect(stored.prefsMigrations).toBe(0);
    expect(migratePreferences(stored).prefsMigrations).toBe(PREFS_MIGRATIONS_VERSION);
  });

  it('runs once: preferences already migrated come back unchanged', () => {
    const migrated = migratePreferences(withDefaults({}));
    expect(migratePreferences(migrated)).toBe(migrated);
  });

  it('keeps every other preference', () => {
    const stored = withDefaults({ theme: 'sepia', enabledProviderIds: ['aramorph', 'alwasit'], fontSizePct: 120 });
    const migrated = migratePreferences(stored);
    expect(migrated.theme).toBe('sepia');
    expect(migrated.enabledProviderIds).toEqual(['aramorph', 'alwasit']);
    expect(migrated.fontSizePct).toBe(120);
  });

  it('copes with a missing or broken version number', () => {
    const broken = { ...DEFAULT_PREFS, prefsMigrations: Number.NaN };
    expect(migratePreferences(broken)).toMatchObject({ prefsMigrations: PREFS_MIGRATIONS_VERSION });
  });
});
