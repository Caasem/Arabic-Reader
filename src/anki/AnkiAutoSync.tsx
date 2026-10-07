import { useEffect, useRef } from 'react';
import { usePreferences } from '../state/PreferencesContext';
import { logDiagnostic } from '../diagnostics/diagnosticsLog';
import { pingAnki } from './ankiConnect';
import { runAnkiSync } from './runAnkiSync';

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_MS = 30 * 1000;

/**
 * "Sync automatically" (Settings → Anki): every 15 minutes while the app is open, if Anki answers.
 * Silent: results go to the diagnostics log, never to a toast. Mounted once in App.
 */
export function AnkiAutoSync() {
  const { prefs } = usePreferences();
  const running = useRef(false);
  const { ankiAutoSync, ankiDeckName, ankiRemoveDeleted } = prefs;

  useEffect(() => {
    if (!ankiAutoSync) return;
    const run = async () => {
      if (running.current || document.hidden) return;
      running.current = true;
      try {
        if (!(await pingAnki())) return;
        const summary = await runAnkiSync({ deck: ankiDeckName || 'Arabic Vocabulary', removeDeleted: ankiRemoveDeleted });
        logDiagnostic('info', 'anki', `Automatic sync: ${summary}`);
      } catch (e) {
        logDiagnostic('warn', 'anki', 'Automatic Anki sync failed', e);
      } finally {
        running.current = false;
      }
    };
    const first = window.setTimeout(run, FIRST_RUN_MS);
    const every = window.setInterval(run, INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [ankiAutoSync, ankiDeckName, ankiRemoveDeleted]);

  return null;
}
