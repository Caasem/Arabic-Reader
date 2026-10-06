import type { ReaderPreferences } from '../types';
import { initialPreferences, withDefaults } from '../state/defaultPreferences';
import { db } from './schema';
import { putSynced } from './writeLayer';

export async function getPreferences(): Promise<ReaderPreferences> {
  const row = await db.preferences.get('default');
  if (!row) return initialPreferences();
  const { id: _id, updatedAt: _updatedAt, ...stored } = row;
  return withDefaults(stored);
}
export async function savePreferences(prefs: ReaderPreferences): Promise<void> {
  await putSynced('preferences', { id: 'default', ...prefs });
}
