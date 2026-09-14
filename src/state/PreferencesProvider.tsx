import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { persistenceService } from '../persistence/db';
import { dictionaryManager } from '../dictionary/DictionaryManager';
import { pomodoroService } from '../pomodoro/pomodoroService';
import type { ReaderPreferences } from '../types';
import { readJSON, STORAGE_KEYS, writeJSON } from '../utils/storage';
import { withDefaults } from './defaultPreferences';
import { PreferencesContext, type ResolvedTheme } from './PreferencesContext';

/** IndexedDB writes are coalesced so dragging a slider doesn't write per tick. */
const PERSIST_DELAY_MS = 250;

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_SCHEME_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const systemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

function readMirror(): ReaderPreferences | null {
  const stored = readJSON<Partial<ReaderPreferences>>(STORAGE_KEYS.preferencesMirror);
  return stored && typeof stored === 'object' ? withDefaults(stored) : null;
}

/**
 * Single source of truth for reading preferences. Every change is mirrored to
 * localStorage immediately (instant first paint on the next launch, and it
 * survives a reload that lands before the debounced IndexedDB write);
 * IndexedDB remains the durable copy used when the mirror is missing.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [initialMirror] = useState(readMirror);
  const [prefs, setPrefs] = useState<ReaderPreferences | null>(initialMirror);
  const pendingSaveRef = useRef<ReaderPreferences | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialMirror) return;
    let cancelled = false;
    persistenceService.getPreferences().then((stored) => {
      if (!cancelled) setPrefs(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [initialMirror]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) void persistenceService.savePreferences(pending);
  }, []);

  useEffect(() => {
    if (!prefs) return;
    writeJSON(STORAGE_KEYS.preferencesMirror, prefs);
    pendingSaveRef.current = prefs;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushSave, PERSIST_DELAY_MS);
  }, [prefs, flushSave]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushSave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flushSave();
    };
  }, [flushSave]);

  const enabledProviderIds = prefs?.enabledProviderIds;
  useEffect(() => {
    if (enabledProviderIds) dictionaryManager.setEnabledProviders(enabledProviderIds);
  }, [enabledProviderIds]);

  const workMinutes = prefs?.pomodoroWorkMinutes;
  const breakMinutes = prefs?.pomodoroBreakMinutes;
  const autoCycle = prefs?.pomodoroAutoCycle;
  const notification = prefs?.pomodoroNotification;
  useEffect(() => {
    if (workMinutes === undefined || breakMinutes === undefined || autoCycle === undefined || notification === undefined) return;
    pomodoroService.setPrefs({
      pomodoroWorkMinutes: workMinutes,
      pomodoroBreakMinutes: breakMinutes,
      pomodoroAutoCycle: autoCycle,
      pomodoroNotification: notification,
    });
  }, [workMinutes, breakMinutes, autoCycle, notification]);

  const updatePrefs = useCallback((patch: Partial<ReaderPreferences>) => {
    setPrefs((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, () => false);
  const theme = prefs?.theme ?? 'light';
  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Layout effect: the palette is in place before any child's passive effect
  // (e.g. the Reader theming its book iframe) runs.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo(() => (prefs ? { prefs, updatePrefs, resolvedTheme } : null), [prefs, updatePrefs, resolvedTheme]);
  if (!value) return null;
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
