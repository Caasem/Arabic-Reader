import { useEffect, useState, type ReactNode } from 'react';
import { persistenceService } from '../persistence/db';
import { dictionaryManager } from '../dictionary/DictionaryManager';
import type { ReaderPreferences } from '../types';
import { PreferencesContext } from './PreferencesContext';

const FALLBACK_PREFS: ReaderPreferences = {
  theme: 'light',
  fontSizePct: 100,
  fontFamily: "'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', serif",
  lineHeight: 2.1,
  readingWidthPct: 100,
  enabledProviderIds: ['aramorph'],
  readingFlow: 'paginated',
  continuousScrollEnabled: false,
  showPageBoundaries: false,
  hoverPreviewEnabled: false,
  sentenceContextEnabled: true,
  quickAddShortcutEnabled: false,
  ankiDeckName: 'Arabic Vocabulary',
  speedReaderWpm: 300,
  speedReaderOrpEnabled: true,
  speedReaderContextEnabled: false,
  touchGestures: { singleTap: 'bubble', doubleTap: 'quickSave', hold: 'none' },
  pageDirection: 'auto',
  dictionaryPopupSizePct: 100,
  liveSearchEnabled: true,
  searchHistoryEnabled: true,
  morphDisplayStyle: 'caption',
  twoColumnEnabled: false,
  dictionaryPanelLayout: 'merged',
  dictionaryPanelSingleProviderId: null,
  dictionaryPopupPinFooter: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  pomodoroAutoCycle: true,
  pomodoroNotification: 'toast',
  pomodoroShowPhaseLabel: true,
};

/**
 * Single source of truth for reading preferences and which dictionary
 * providers are switched on. Loaded once at startup, persisted to
 * IndexedDB on every change, and pushed into the DictionaryManager
 * singleton so a provider toggle takes effect on the very next lookup.
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

  // 'system' resolves live to 'dark'/'light' via prefers-color-scheme,
  // including an OS theme change made while the app is open.
  useEffect(() => {
    if (prefs.theme !== 'system') {
      document.documentElement.dataset.theme = prefs.theme;
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = mql.matches ? 'dark' : 'light';
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
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
