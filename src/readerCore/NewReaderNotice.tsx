import { usePreferences } from '../state/PreferencesContext';
import './newReaderNotice.css';

/**
 * Shown once in the new reader to someone preference migration 1
 * (src/state/prefsMigrations.ts) moved there. Switch back restores the reader
 * they had until the old readers go in phase 2b, which deletes this too.
 */
export function NewReaderNotice() {
  const { prefs, updatePrefs } = usePreferences();
  const switchBack = prefs.newReaderSwitchBack;
  if (!switchBack) return null;

  return (
    <div className="new-reader-notice" role="status">
      <p className="new-reader-notice__text">
        Books now open in the new reader, on every device. The previous readers will be removed in a coming version;
        until then you can switch back here or in Settings → Reader.
      </p>
      <div className="new-reader-notice__actions">
        <button
          type="button"
          className="new-reader-notice__back"
          onClick={() => updatePrefs({ quietReaderEnabled: false, cleanReaderEnabled: switchBack.cleanReaderEnabled, newReaderSwitchBack: null })}
        >
          Switch back
        </button>
        <button type="button" className="new-reader-notice__ok" onClick={() => updatePrefs({ newReaderSwitchBack: null })}>
          Keep the new reader
        </button>
      </div>
    </div>
  );
}
