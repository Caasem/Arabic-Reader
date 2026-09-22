import { createContext, useContext } from 'react';
import type { ReaderPreferences } from '../types';

/** A concrete palette: 'system' resolved against the OS setting. */
export type ResolvedTheme = 'light' | 'dark' | 'sepia';

export interface PreferencesContextValue {
  prefs: ReaderPreferences;
  updatePrefs: (patch: Partial<ReaderPreferences>) => void;
  resolvedTheme: ResolvedTheme;
}

/** Provided by `PreferencesProvider` (kept in its own file so this module
 * exports no components, which keeps React Fast Refresh working). */
export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
