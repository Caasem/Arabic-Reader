import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { persistenceService } from '../persistence/db';
import { dictionaryManager } from '../dictionary/DictionaryManager';
import type { ReaderPreferences } from '../types';

const FALLBACK_PREFS: ReaderPreferences = {
  theme: 'light',
  fontSizePct: 100,
  fontFamily: "'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', serif",
  lineHeight: 2.1,
  readingWidthPct: 100,
  enabledProviderIds: ['aramorph'],
  readingFlow: 'paginated',
  hoverPreviewEnabled: false,
  sentenceContextEnabled: true,
  quickAddShortcutEnabled: false,
  ankiDeckName: 'Arabic Vocabulary',
  speedReaderWpm: 300,
  speedReaderOrpEnabled: true,
  speedReaderContextEnabled: false,
  touchGestures: { singleTap: 'bubble', doubleTap: 'quickSave', hold: 'none' },
};

interface PreferencesContextValue {
  prefs: ReaderPreferences;
  updatePrefs: (patch: Partial<ReaderPreferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Single source of truth for reading preferences and which dictionary
 * providers are switched on. Loaded once at startup, persisted to
 * IndexedDB on every change, and pushed into the DictionaryManager
 * singleton so a provider toggle in Settings takes effect on the very next
 * lookup — the Reader component picks up preference changes reactively
 * through this context rather than needing its own copy of the logic.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ReaderPreferences>(FALLBACK_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    persistenceService.getPreferences().then((p) => {
      setPrefs(p);
      setLoaded(true);
      dictionaryManager.setEnabledProviders(p.enabledProviderIds);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  function updatePrefs(patch: Partial<ReaderPreferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      persistenceService.savePreferences(next);
      if (patch.enabledProviderIds) dictionaryManager.setEnabledProviders(next.enabledProviderIds);
      return next;
    });
  }

  if (!loaded) return null;

  return <PreferencesContext.Provider value={{ prefs, updatePrefs }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
