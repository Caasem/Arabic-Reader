import type { ReaderPreferences } from '../types';
import { initialPreferences, withDefaults } from '../state/defaultPreferences';
import { db } from './schema';

export async function getPreferences(): Promise<ReaderPreferences> {
  const row = await db.preferences.get('default');
  if (!row) return initialPreferences();
  const { id: _id, ...stored } = row;
  return withDefaults(stored);
}
export async function savePreferences(prefs: ReaderPreferences): Promise<void> {
  await db.preferences.put({ id: 'default', ...prefs });
}
