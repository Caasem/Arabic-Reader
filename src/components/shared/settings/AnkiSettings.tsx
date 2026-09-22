import { useState } from 'react';
import { usePreferences } from '../../../state/PreferencesContext';
import { AnkiConnectError, ensureDeck, getDeckNames, pingAnki } from '../../../anki/ankiConnect';
import { syncToAnki } from '../../../anki/ankiSync';
import { logDiagnostic } from '../../../diagnostics/diagnosticsLog';
import { vocabularyService } from '../../../vocabulary';
import { Note, SettingsSection } from './controls';

const DEFAULT_DECK = 'Arabic Vocabulary';

export function AnkiSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    setStatus('Connecting to Anki…');
    try {
      if (!(await pingAnki())) {
        setStatus(
          "Couldn't reach Anki. Make sure the Anki desktop app is open with the AnkiConnect add-on installed, " +
            "and that this app's address (shown in your browser's URL bar) has been added to AnkiConnect's " +
            'webCorsOriginList — open Anki → Tools → Add-ons → AnkiConnect → Config, and add it to the list there.'
        );
        return;
      }
      const deck = prefs.ankiDeckName || DEFAULT_DECK;
      if (!(await getDeckNames()).includes(deck)) await ensureDeck(deck);

      const unsynced = (await vocabularyService.list()).filter((item) => !item.syncedToAnki);
      if (unsynced.length === 0) {
        setStatus('Nothing new to sync — every saved word has already been sent to Anki.');
        return;
      }

      const { added, alreadyInAnki, failed } = await syncToAnki(deck, unsynced, (item) =>
        vocabularyService.markSyncedToAnki(item)
      );
      const parts = [`Synced ${added} word${added === 1 ? '' : 's'} to the "${deck}" deck in Anki.`];
      if (alreadyInAnki) parts.push(`${alreadyInAnki} ${alreadyInAnki === 1 ? 'was' : 'were'} already there.`);
      if (failed) parts.push(`${failed} couldn't be added — try syncing again.`);
      setStatus(parts.join(' '));
    } catch (e) {
      logDiagnostic('warn', 'anki', 'Anki sync failed', e);
      setStatus(e instanceof AnkiConnectError || e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="Anki sync">
      <Note>
        Push saved vocabulary to Anki via AnkiConnect — requires the Anki desktop app to be open with the{' '}
        <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">
          AnkiConnect
        </a>{' '}
        add-on installed. The first sync will likely fail with a connection error until you add this app's address to
        AnkiConnect's <code>webCorsOriginList</code> (Anki → Tools → Add-ons → AnkiConnect → Config) — the error message
        below will say so if that's what's happening. Each word is synced once; re-running sync only sends words saved
        since the last sync.
      </Note>
      <div className="settings-row">
        <label className="settings-row__label" htmlFor="anki-deck-name">
          Deck name
        </label>
        <div className="settings-row__control">
          <input
            id="anki-deck-name"
            type="text"
            value={prefs.ankiDeckName}
            placeholder={DEFAULT_DECK}
            onChange={(e) => updatePrefs({ ankiDeckName: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={sync} disabled={busy}>
          {busy ? 'Syncing…' : 'Sync to Anki'}
        </button>
      </div>
      {status && (
        <p className="settings-section__note" role="status">
          {status}
        </p>
      )}
    </SettingsSection>
  );
}
