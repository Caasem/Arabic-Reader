import { useState } from 'react';
import { usePreferences } from '../../../state/PreferencesContext';
import { AnkiConnectError, getDeckNames, pingAnki } from '../../../anki/ankiConnect';
import { runAnkiSync } from '../../../anki/runAnkiSync';
import { logDiagnostic } from '../../../diagnostics/diagnosticsLog';
import { vocabularyService } from '../../../vocabulary';
import { Note, SettingsSection, ToggleRow } from './controls';

export const DEFAULT_DECK = 'Arabic Vocabulary';

const UNREACHABLE =
  "Couldn't reach Anki. Make sure the Anki desktop app is open with the AnkiConnect add-on installed, " +
  "and that this app's address (shown in your browser's URL bar) has been added to AnkiConnect's " +
  'webCorsOriginList: open Anki → Tools → Add-ons → AnkiConnect → Config, and add it to the list there.';

export function AnkiSettings() {
  const { prefs, updatePrefs } = usePreferences();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'export' | 'decks' | null>(null);
  const [decks, setDecks] = useState<string[] | null>(null);
  const deck = prefs.ankiDeckName || DEFAULT_DECK;

  async function loadDecks() {
    setBusy('decks');
    try {
      if (!(await pingAnki())) return setStatus(UNREACHABLE);
      setDecks(await getDeckNames());
      setStatus('Connected to Anki.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not list decks.');
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    setStatus('Connecting to Anki…');
    try {
      if (!(await pingAnki())) return setStatus(UNREACHABLE);
      const summary = await runAnkiSync({ deck, removeDeleted: prefs.ankiRemoveDeleted, onProgress: (done, total) => setStatus(`Syncing ${done} of ${total}…`) });
      setStatus(summary);
    } catch (e) {
      logDiagnostic('warn', 'anki', 'Anki sync failed', e);
      setStatus(e instanceof AnkiConnectError || e instanceof Error ? `While syncing: ${e.message}` : 'Sync failed.');
    } finally {
      setBusy(null);
    }
  }

  async function exportPackage() {
    setBusy('export');
    setStatus('Building the Anki package…');
    try {
      const items = await vocabularyService.list();
      if (!items.length) return setStatus('No saved words to export yet.');
      const { exportApkg } = await import('../../../anki/apkg');
      const result = await exportApkg(items, deck);
      setStatus(result === 'cancelled' ? null : `Exported ${items.length} card${items.length === 1 ? '' : 's'}. Open the file in Anki, AnkiDroid or AnkiMobile to import it.`);
    } catch (e) {
      logDiagnostic('warn', 'anki', 'Anki export failed', e);
      setStatus(e instanceof Error ? `Could not export: ${e.message}` : 'Could not export.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection title="Anki">
      <Note>
        Two ways to get your words into Anki. <strong>Export</strong> makes an Anki package (.apkg) that works on any
        device: open it in Anki, AnkiDroid or AnkiMobile; exporting again later updates the same notes. <strong>Sync</strong>{' '}
        talks to the Anki desktop app directly through the{' '}
        <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">
          AnkiConnect
        </a>{' '}
        add-on: it adds new words, updates notes you have edited here, and finds notes sent by earlier versions. The first
        sync usually needs this app&apos;s address added to AnkiConnect&apos;s <code>webCorsOriginList</code> (Anki → Tools →
        Add-ons → AnkiConnect → Config). Notes use an &quot;Arabic Reader&quot; note type with the word, vowels, meaning,
        root, sentence and book.
      </Note>
      <div className="settings-row">
        <label className="settings-row__label" htmlFor="anki-deck-name">
          Deck
        </label>
        <div className="settings-row__control" style={{ display: 'flex', gap: 8 }}>
          <input
            id="anki-deck-name"
            type="text"
            list="anki-deck-list"
            value={prefs.ankiDeckName}
            placeholder={DEFAULT_DECK}
            onChange={(e) => updatePrefs({ ankiDeckName: e.target.value })}
            style={{ flex: 1 }}
          />
          <datalist id="anki-deck-list">{decks?.map((d) => <option key={d} value={d} />)}</datalist>
          <button className="btn btn--ghost" onClick={loadDecks} disabled={busy !== null} title="List the decks in Anki">
            {busy === 'decks' ? '…' : 'Decks'}
          </button>
        </div>
      </div>
      <ToggleRow label="Sync automatically" checked={prefs.ankiAutoSync} onChange={(ankiAutoSync) => updatePrefs({ ankiAutoSync })}>
        Every 15 minutes while the app is open and Anki is running.
      </ToggleRow>
      <ToggleRow
        label="Remove deleted words from Anki"
        checked={prefs.ankiRemoveDeleted}
        onChange={(ankiRemoveDeleted) => updatePrefs({ ankiRemoveDeleted })}
      >
        When you remove a word here, the next sync deletes its note in Anki too, with its review history there.
      </ToggleRow>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={sync} disabled={busy !== null}>
          {busy === 'sync' ? 'Syncing…' : 'Sync to Anki'}
        </button>
        <button className="btn btn--ghost" onClick={exportPackage} disabled={busy !== null}>
          {busy === 'export' ? 'Exporting…' : 'Export Anki package (.apkg)'}
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
