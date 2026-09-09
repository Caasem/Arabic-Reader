import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../../state/PreferencesContext';
import { dictionaryManager } from '../../dictionary/DictionaryManager';
import { aramorphProvider } from '../../dictionary/providers/aramorph/AramorphDictionaryProvider';
import { DICT_FILE_NAMES, type DictFileName } from '../../dictionary/providers/aramorph/dictFileNames';
import { isRarityDataReady, enableRarityData, disableRarityData } from '../../vocabRarity/rarity';
import { pingAnki, getDeckNames, ensureDeck, addNote, AnkiConnectError } from '../../anki/ankiConnect';
import { vocabularyService } from '../../vocabulary/vocabularyService';
import { BackupControls } from './BackupControls';
import type { PageDirection, ReaderTheme, ReadingFlow, TouchDictionaryAction } from '../../types';
import './SettingsPanel.css';

const THEMES: { id: ReaderTheme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Night' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'system', label: 'System' },
];

const READING_FLOWS: { id: ReadingFlow; label: string }[] = [
  { id: 'paginated', label: 'Paged' },
  { id: 'scrolled', label: 'Scrolling' },
];

const PAGE_DIRECTIONS: { id: PageDirection; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'rtl', label: 'RTL' },
  { id: 'ltr', label: 'LTR' },
];

const TOUCH_ACTIONS: { id: TouchDictionaryAction; label: string }[] = [
  { id: 'bubble', label: 'Show definition bubble' },
  { id: 'quickSave', label: 'Quick-save to vocabulary' },
  { id: 'openDictionary', label: 'Open full dictionary' },
  { id: 'none', label: 'Off' },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { prefs, updatePrefs } = usePreferences();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [aramorphReady, setAramorphReady] = useState(aramorphProvider.isReady);
  const [rarityReady, setRarityReady] = useState<boolean | null>(null);
  const [rarityBusy, setRarityBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [perFileSelection, setPerFileSelection] = useState<Partial<Record<DictFileName, File>>>({});

  const [ankiStatus, setAnkiStatus] = useState<string | null>(null);
  const [ankiBusy, setAnkiBusy] = useState(false);

  useEffect(() => {
    isRarityDataReady().then(setRarityReady);
  }, []);

  async function handleClearRarityData() {
    setRarityBusy(true);
    try {
      await disableRarityData();
      setRarityReady(false);
    } finally {
      setRarityBusy(false);
    }
  }

  async function handleEnableRarityData() {
    setRarityBusy(true);
    try {
      await enableRarityData();
      setRarityReady(true);
    } finally {
      setRarityBusy(false);
    }
  }

  const providers = dictionaryManager.getProviders();

  // The AraMorph engine finishes loading (cache read, or a fetch of the
  // bundled default dataset) asynchronously after this component mounts —
  // reflect that once it resolves rather than only after a manual upload.
  useEffect(() => {
    aramorphProvider.whenReady().then(() => setAramorphReady(aramorphProvider.isReady));
  }, []);

  function toggleProvider(id: string, on: boolean) {
    const next = on
      ? Array.from(new Set([...prefs.enabledProviderIds, id]))
      : prefs.enabledProviderIds.filter((p) => p !== id);
    updatePrefs({ enabledProviderIds: next });
  }

  async function handleImport(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    setImportError(null);
    setImporting(true);
    try {
      await aramorphProvider.importFiles(fileList);
      setAramorphReady(true);
      if (!prefs.enabledProviderIds.includes('aramorph')) toggleProvider('aramorph', true);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read those files.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handlePerFileChange(name: DictFileName, file: File | null) {
    setPerFileSelection((prev) => {
      const next = { ...prev };
      if (file) next[name] = file;
      else delete next[name];
      return next;
    });
  }

  async function handleImportPerFile() {
    setImportError(null);
    setImporting(true);
    try {
      await aramorphProvider.importFileMap(perFileSelection);
      setAramorphReady(true);
      setPerFileSelection({});
      if (!prefs.enabledProviderIds.includes('aramorph')) toggleProvider('aramorph', true);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read those files.');
    } finally {
      setImporting(false);
    }
  }

  async function handleResetAramorph() {
    setImporting(true);
    try {
      await aramorphProvider.resetToBundled();
      setAramorphReady(aramorphProvider.isReady);
    } finally {
      setImporting(false);
    }
  }

  async function handleAnkiSync() {
    setAnkiBusy(true);
    setAnkiStatus('Connecting to Anki…');
    try {
      const reachable = await pingAnki();
      if (!reachable) {
        setAnkiStatus(
          "Couldn't reach Anki. Make sure the Anki desktop app is open with the AnkiConnect add-on installed, " +
            "and that this app's address (shown in your browser's URL bar) has been added to AnkiConnect's " +
            'webCorsOriginList — open Anki → Tools → Add-ons → AnkiConnect → Config, and add it to the list there.'
        );
        return;
      }
      const decks = await getDeckNames();
      const deck = prefs.ankiDeckName || 'Arabic Vocabulary';
      if (!decks.includes(deck)) await ensureDeck(deck);

      const items = await vocabularyService.list();
      const unsynced = items.filter((i) => !i.syncedToAnki);
      if (unsynced.length === 0) {
        setAnkiStatus('Nothing new to sync — every saved word has already been sent to Anki.');
        return;
      }

      // Sequential rather than parallel — this only runs after a
      // user-initiated sync (not a hot path), and AnkiConnect handles one
      // request at a time anyway.
      let synced = 0;
      for (const item of unsynced) {
        const back = [item.meaning, item.sentence ? `\n\n${item.sentence}` : ''].join('');
        await addNote(deck, item.surfaceForm, back, ['arabic-reader']);
        await vocabularyService.markSyncedToAnki(item);
        synced++;
      }
      setAnkiStatus(`Synced ${synced} word${synced === 1 ? '' : 's'} to the "${deck}" deck in Anki.`);
    } catch (e) {
      setAnkiStatus(e instanceof AnkiConnectError ? e.message : e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setAnkiBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-panel__header">
          <h2>Settings</h2>
          <button className="settings-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <section className="settings-section">
          <h3>Reading</h3>

          <div className="settings-row">
            <span className="settings-row__label">Theme</span>
            <div className="settings-row__control settings-row__control--segmented">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={'segmented__item' + (prefs.theme === t.id ? ' segmented__item--active' : '')}
                  onClick={() => updatePrefs({ theme: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row__label">Layout</span>
            <div className="settings-row__control settings-row__control--segmented">
              {READING_FLOWS.map((f) => (
                <button
                  key={f.id}
                  className={'segmented__item' + (prefs.readingFlow === f.id ? ' segmented__item--active' : '')}
                  onClick={() => updatePrefs({ readingFlow: f.id })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row__label">Font size</span>
            <div className="settings-row__control">
              <input
                type="range"
                min={80}
                max={160}
                step={5}
                value={prefs.fontSizePct}
                onChange={(e) => updatePrefs({ fontSizePct: Number(e.target.value) })}
              />
              <span className="settings-row__value">{prefs.fontSizePct}%</span>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row__label">Line height</span>
            <div className="settings-row__control">
              <input
                type="range"
                min={1.4}
                max={2.8}
                step={0.1}
                value={prefs.lineHeight}
                onChange={(e) => updatePrefs({ lineHeight: Number(e.target.value) })}
              />
              <span className="settings-row__value">{prefs.lineHeight.toFixed(1)}</span>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row__label">Page direction</span>
            <div className="settings-row__control settings-row__control--segmented">
              {PAGE_DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  className={'segmented__item' + (prefs.pageDirection === d.id ? ' segmented__item--active' : '')}
                  onClick={() => updatePrefs({ pageDirection: d.id })}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row__label">Reading width</span>
            <div className="settings-row__control">
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={prefs.readingWidthPct}
                onChange={(e) => updatePrefs({ readingWidthPct: Number(e.target.value) })}
              />
              <span className="settings-row__value">{prefs.readingWidthPct}%</span>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Dictionaries</h3>
          <p className="settings-section__note">Choose which dictionaries are queried when you tap a word.</p>

          <div className="settings-row">
            <span className="settings-row__label">Dictionary popup size</span>
            <div className="settings-row__control">
              <input
                type="range"
                min={70}
                max={150}
                step={5}
                value={prefs.dictionaryPopupSizePct}
                onChange={(e) => updatePrefs({ dictionaryPopupSizePct: Number(e.target.value) })}
              />
              <span className="settings-row__value">{prefs.dictionaryPopupSizePct}%</span>
            </div>
          </div>
          <p className="settings-section__note">
            100% is the popup's normal size. The popup always repositions itself to stay fully on-screen regardless
            of this setting.
          </p>

          <div className="settings-row">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.hoverPreviewEnabled}
                onChange={(e) => updatePrefs({ hoverPreviewEnabled: e.target.checked })}
              />
              <span className="settings-toggle__label">Show translation on hover</span>
            </label>
          </div>
          <p className="settings-section__note">
            Hovering a word (mouse only — not for touch) shows a condensed one-line preview. Tapping or clicking still
            opens the full entry as before.
          </p>

          <div className="settings-row">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.sentenceContextEnabled}
                onChange={(e) => updatePrefs({ sentenceContextEnabled: e.target.checked })}
              />
              <span className="settings-toggle__label">Capture sentence context</span>
            </label>
          </div>
          <p className="settings-section__note">
            When on, clicking a word also grabs the sentence it appeared in and stores it alongside the lookup — shown
            in the popup, on the Vocabulary card, and used as context in Review and Anki sync.
          </p>

          <div className="settings-row">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.quickAddShortcutEnabled}
                onChange={(e) => updatePrefs({ quickAddShortcutEnabled: e.target.checked })}
              />
              <span className="settings-toggle__label">Quick-add shortcut (Ctrl+Shift+A)</span>
            </label>
          </div>
          <p className="settings-section__note">
            When on, press Ctrl+Shift+A any time after clicking a word to save it straight to your vocabulary,
            without opening the popup or clicking "+ Add."
          </p>

          {providers.map((p) => {
            const isAramorph = p.id === 'aramorph';
            const enabled = prefs.enabledProviderIds.includes(p.id);
            return (
              <div className="settings-row settings-row--dict" key={p.id}>
                <label className="settings-toggle">
                  <input type="checkbox" checked={enabled} onChange={(e) => toggleProvider(p.id, e.target.checked)} />
                  <span className="settings-toggle__label">{p.name}</span>
                </label>
                {isAramorph && (
                  <span className={'settings-badge' + (aramorphReady ? ' settings-badge--ready' : '')}>
                    {aramorphReady ? 'Data loaded' : 'No data loaded'}
                  </span>
                )}
              </div>
            );
          })}

          <div className="settings-aramorph">
            <p className="settings-section__note">
              AraMorph ships with a built-in Arabic dictionary and morphology dataset (from this project's browser
              extension), so no upload is needed to get started. You can optionally replace it with your own copy of
              the six data files (<code>dictprefixes</code>, <code>dictstems</code>, <code>dictsuffixes</code>,{' '}
              <code>tableab</code>, <code>tableac</code>, <code>tablebc</code>) — kept only in your browser.
            </p>
            <p className="settings-section__note">
              The bundled dictionary and morphology data (Tim Buckwalter's AraMorph analyzer, via the Linguistic Data
              Consortium) is licensed under the GNU General Public License v2. This application's own source code is
              also GPLv2 — see the <code>LICENSE</code> file included with the app, and{' '}
              <code>dictionary-data/GPL.redistributable.txt</code> for the data's own license text.
            </p>
            <div className="settings-aramorph__actions">
              <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? 'Reading files…' : aramorphReady ? 'Replace with custom files' : 'Upload custom files'}
              </button>
              {aramorphReady && (
                <button className="btn btn--ghost" onClick={handleResetAramorph} disabled={importing}>
                  Reset to default
                </button>
              )}
              <button
                className="btn btn--ghost"
                onClick={async () => {
                  const result = await dictionaryManager.lookup('كان');
                  const sizes = aramorphProvider.tableSizes;
                  alert(
                    `Test word: كان\nEntries found: ${result.entries.length}\n` +
                      (result.entries[0]?.senses[0]?.gloss ?? '(no gloss — this is the bug)') +
                      `\n\nLoaded table sizes:\n` +
                      (sizes
                        ? Object.entries(sizes)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join('\n')
                        : '(not loaded)')
                  );
                }}
              >
                Test dictionary lookup
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleImport(e.target.files)} />
            </div>

            <div className="settings-aramorph__per-file">
              <p className="settings-section__note">
                If picking all six files at once doesn't work well in your file manager, pick them one at a time
                instead:
              </p>
              {DICT_FILE_NAMES.map((name) => (
                <div className="settings-row" key={name} style={{ flexWrap: 'wrap', gap: 8 }}>
                  <label className="settings-toggle" style={{ minWidth: 110 }}>
                    <code>{name}</code>
                  </label>
                  <input
                    type="file"
                    disabled={importing}
                    style={{ maxWidth: '100%' }}
                    onChange={(e) => handlePerFileChange(name, e.target.files?.[0] ?? null)}
                  />
                  <span className={'settings-badge' + (perFileSelection[name] ? ' settings-badge--ready' : '')}>
                    {perFileSelection[name] ? `✓ ${perFileSelection[name]!.name}` : 'Not selected'}
                  </span>
                </div>
              ))}
              <button
                className="btn btn--ghost"
                onClick={handleImportPerFile}
                disabled={importing || DICT_FILE_NAMES.some((n) => !perFileSelection[n])}
              >
                {importing ? 'Reading files…' : 'Import these six files'}
              </button>
            </div>
            {importError && <div className="settings-aramorph__error">{importError}</div>}
          </div>
        </section>

        <section className="settings-section">
          <h3>Vocabulary Levels</h3>
          <p className="settings-section__note">
            Powers the rarity badge shown in word lookups and the "Vocab Levels" tab's beginner/intermediate/advanced
            word lists — derived from a personal, frequency-ordered vocabulary list built into the app. Small enough
            to be ready instantly, no download involved.
          </p>
          {rarityReady === true && (
            <div className="settings-row">
              <span className={'settings-badge settings-badge--ready'}>Enabled</span>
              <button className="btn btn--ghost" onClick={handleClearRarityData} disabled={rarityBusy}>
                {rarityBusy ? 'Disabling…' : 'Disable'}
              </button>
            </div>
          )}
          {rarityReady === false && (
            <div className="settings-row">
              <span className="settings-badge">Not enabled</span>
              <button className="btn btn--ghost" onClick={handleEnableRarityData} disabled={rarityBusy}>
                {rarityBusy ? 'Preparing…' : 'Enable now'}
              </button>
            </div>
          )}
        </section>

        <section className="settings-section">
          <h3>Backup</h3>
          <p className="settings-section__note">
            Your vocabulary, per-word encounter history, and highlights all live only in this browser. Export a
            backup file periodically, or before clearing browser data or switching computers — importing it back in
            (here or in another browser) restores everything. Importing overwrites any local item that shares an id
            with one in the file. The same export/import buttons are also available directly on the Vocabulary and
            Review tabs.
          </p>
          <BackupControls />
        </section>

        <section className="settings-section">
          <h3>Search</h3>
          <div className="settings-row">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.liveSearchEnabled}
                onChange={(e) => updatePrefs({ liveSearchEnabled: e.target.checked })}
              />
              <span className="settings-toggle__label">Live search</span>
            </label>
          </div>
          <p className="settings-section__note">Results update while typing, instead of waiting for you to submit.</p>
          <div className="settings-row">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={prefs.searchHistoryEnabled}
                onChange={(e) => updatePrefs({ searchHistoryEnabled: e.target.checked })}
              />
              <span className="settings-toggle__label">Search history</span>
            </label>
          </div>
          <p className="settings-section__note">Remember recent in-book searches so they can be reused later.</p>
        </section>

        <section className="settings-section">
          <h3>Touch gestures</h3>
          <p className="settings-section__note">
            On a touchscreen, tapping a word always responds instantly — there's no artificial delay to tell a
            single tap from the start of a double tap. A second quick tap on the same word (within about a third of
            a second) triggers the "Double tap" action below, on top of whatever the first tap already did. These
            settings have no effect for a mouse click, which always opens the full dictionary popup as before.
          </p>
          <div className="settings-row">
            <span className="settings-row__label">Single tap</span>
            <select
              className="settings-row__select"
              value={prefs.touchGestures.singleTap}
              onChange={(e) =>
                updatePrefs({ touchGestures: { ...prefs.touchGestures, singleTap: e.target.value as TouchDictionaryAction } })
              }
            >
              {TOUCH_ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">Double tap</span>
            <select
              className="settings-row__select"
              value={prefs.touchGestures.doubleTap}
              onChange={(e) =>
                updatePrefs({ touchGestures: { ...prefs.touchGestures, doubleTap: e.target.value as TouchDictionaryAction } })
              }
            >
              {TOUCH_ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-row__label">Hold (long-press)</span>
            <select
              className="settings-row__select"
              value={prefs.touchGestures.hold}
              onChange={(e) =>
                updatePrefs({ touchGestures: { ...prefs.touchGestures, hold: e.target.value as TouchDictionaryAction } })
              }
            >
              {TOUCH_ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <p className="settings-section__note">
            Hold is off by default: a long-press is also how your phone's own text selection starts (for
            highlighting), so turning Hold on trades a plain long-press-to-select away in favor of whatever action
            you assign it here. Dragging your finger after touching down — to scroll or to select text — always
            cancels any gesture in progress, so none of these ever get in the way of scrolling or highlighting.
          </p>
        </section>

        <section className="settings-section">
          <h3>Anki sync</h3>
          <p className="settings-section__note">
            Push saved vocabulary to Anki via AnkiConnect — requires the Anki desktop app to be open with the{' '}
            <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">
              AnkiConnect
            </a>{' '}
            add-on installed. The first sync will likely fail with a connection error until you add this app's
            address to AnkiConnect's <code>webCorsOriginList</code> (Anki → Tools → Add-ons → AnkiConnect → Config) —
            the error message below will say so if that's what's happening. Each word is synced once; re-running sync
            only sends words saved since the last sync.
          </p>
          <div className="settings-row">
            <span className="settings-row__label">Deck name</span>
            <div className="settings-row__control">
              <input
                type="text"
                value={prefs.ankiDeckName}
                onChange={(e) => updatePrefs({ ankiDeckName: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="settings-aramorph__actions">
            <button className="btn btn--ghost" onClick={handleAnkiSync} disabled={ankiBusy}>
              {ankiBusy ? 'Syncing…' : 'Sync to Anki'}
            </button>
          </div>
          {ankiStatus && <p className="settings-section__note">{ankiStatus}</p>}
        </section>
      </div>
    </div>
  );
}
