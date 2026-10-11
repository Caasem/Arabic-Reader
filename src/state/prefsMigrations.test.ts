import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, withDefaults } from './defaultPreferences';
import { migratePreferences, PREFS_MIGRATIONS_VERSION } from './prefsMigrations';

describe('migratePreferences', () => {
  it('treats preferences stored before migrations existed as version 0', () => {
    const stored = withDefaults({ quietReaderEnabled: false });
    expect(stored.prefsMigrations).toBe(0);
    expect(migratePreferences(stored).prefsMigrations).toBe(PREFS_MIGRATIONS_VERSION);
  });

  it('moves someone with the new reader off to it, remembering what Switch back restores', () => {
    const migrated = migratePreferences(withDefaults({ quietReaderEnabled: false, cleanReaderEnabled: true }));
    expect(migrated).toMatchObject({ quietReaderEnabled: true, cleanReaderEnabled: false, newReaderSwitchBack: { cleanReaderEnabled: true } });

    const fromEpub = migratePreferences(withDefaults({ quietReaderEnabled: false, cleanReaderEnabled: false }));
    expect(fromEpub.newReaderSwitchBack).toEqual({ cleanReaderEnabled: false });
  });

  it('leaves someone already on the new reader alone, with no notice', () => {
    const migrated = migratePreferences(withDefaults({ quietReaderEnabled: true, fontSizePct: 120 }));
    expect(migrated).toMatchObject({ quietReaderEnabled: true, cleanReaderEnabled: false, newReaderSwitchBack: null, fontSizePct: 120 });
    expect(migrated.prefsMigrations).toBe(PREFS_MIGRATIONS_VERSION);
  });

  it('runs once: switching back afterwards sticks', () => {
    const migrated = migratePreferences(withDefaults({ quietReaderEnabled: false }));
    const switchedBack = { ...migrated, quietReaderEnabled: false, newReaderSwitchBack: null };
    expect(migratePreferences(switchedBack)).toBe(switchedBack);
  });

  it('keeps every other preference', () => {
    const stored = withDefaults({ quietReaderEnabled: false, theme: 'sepia', enabledProviderIds: ['aramorph', 'alwasit'] });
    const migrated = migratePreferences(stored);
    expect(migrated.theme).toBe('sepia');
    expect(migrated.enabledProviderIds).toEqual(['aramorph', 'alwasit']);
  });

  it('copes with a missing or broken version number', () => {
    const broken = { ...DEFAULT_PREFS, quietReaderEnabled: false, prefsMigrations: Number.NaN };
    expect(migratePreferences(broken)).toMatchObject({ quietReaderEnabled: true, prefsMigrations: PREFS_MIGRATIONS_VERSION });
  });
});
