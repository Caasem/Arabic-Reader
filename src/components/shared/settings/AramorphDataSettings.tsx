import { useRef, useState } from 'react';
import { dictionaryManager } from '../../../dictionary/DictionaryManager';
import { aramorphProvider } from '../../../dictionary/providers/aramorph/AramorphDictionaryProvider';
import { DICT_FILE_NAMES, type DictFileName } from '../../../dictionary/providers/aramorph/dictFileNames';
import { Note } from './controls';

interface Props {
  ready: boolean;
  onReadyChange(ready: boolean): void;
  /** A custom dataset was imported (so AraMorph should be switched on). */
  onImported(): void;
}

/** Replacing or resetting AraMorph's dictionary and morphology data. */
export function AramorphDataSettings({ ready, onReadyChange, onImported }: Props) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [perFileSelection, setPerFileSelection] = useState<Partial<Record<DictFileName, File>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function runImport(task: () => Promise<void>) {
    setImportError(null);
    setImporting(true);
    try {
      await task();
      onReadyChange(true);
      onImported();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read those files.');
    } finally {
      setImporting(false);
    }
  }

  function importSelectedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    void runImport(() => aramorphProvider.importFiles(fileList)).finally(() => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function importPerFile() {
    void runImport(async () => {
      await aramorphProvider.importFileMap(perFileSelection);
      setPerFileSelection({});
    });
  }

  function choosePerFile(name: DictFileName, file: File | null) {
    setPerFileSelection((prev) => {
      const next = { ...prev };
      if (file) next[name] = file;
      else delete next[name];
      return next;
    });
  }

  async function resetToBundled() {
    setImporting(true);
    try {
      await aramorphProvider.resetToBundled();
      onReadyChange(aramorphProvider.isReady);
    } finally {
      setImporting(false);
    }
  }

  async function testLookup() {
    const result = await dictionaryManager.lookup('كان');
    const sizes = aramorphProvider.tableSizes;
    alert(
      `Test word: كان\nEntries found: ${result.entries.length}\n` +
        (result.entries[0]?.senses[0]?.gloss ?? '(no gloss)') +
        `\n\nLoaded table sizes:\n` +
        (sizes
          ? Object.entries(sizes)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          : '(not loaded)')
    );
  }

  return (
    <div className="settings-aramorph">
      <Note>
        AraMorph ships with a built-in Arabic dictionary and morphology dataset (from this project's browser extension),
        so no upload is needed to get started. You can optionally replace it with your own copy of the six data files (
        <code>dictprefixes</code>, <code>dictstems</code>, <code>dictsuffixes</code>, <code>tableab</code>,{' '}
        <code>tableac</code>, <code>tablebc</code>) — kept only in your browser.
      </Note>
      <Note>
        The bundled dictionary and morphology data (Tim Buckwalter's AraMorph analyzer, via the Linguistic Data
        Consortium) is licensed under the GNU General Public License v2. This application's own source code is also
        GPLv2 — see the <code>LICENSE</code> file included with the app, and{' '}
        <code>dictionary-data/GPL.redistributable.txt</code> for the data's own license text.
      </Note>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing ? 'Reading files…' : ready ? 'Replace with custom files' : 'Upload custom files'}
        </button>
        {ready && (
          <button className="btn btn--ghost" onClick={resetToBundled} disabled={importing}>
            Reset to default
          </button>
        )}
        <button className="btn btn--ghost" onClick={testLookup}>
          Test dictionary lookup
        </button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => importSelectedFiles(e.target.files)} />
      </div>

      <div className="settings-aramorph__per-file">
        <Note>If picking all six files at once doesn't work well in your file manager, pick them one at a time instead:</Note>
        {DICT_FILE_NAMES.map((name) => (
          <div className="settings-row" key={name} style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="settings-toggle" style={{ minWidth: 110 }} htmlFor={`aramorph-file-${name}`}>
              <code>{name}</code>
            </label>
            <input
              id={`aramorph-file-${name}`}
              type="file"
              disabled={importing}
              style={{ maxWidth: '100%' }}
              onChange={(e) => choosePerFile(name, e.target.files?.[0] ?? null)}
            />
            <span className={'settings-badge' + (perFileSelection[name] ? ' settings-badge--ready' : '')}>
              {perFileSelection[name] ? `✓ ${perFileSelection[name].name}` : 'Not selected'}
            </span>
          </div>
        ))}
        <button
          className="btn btn--ghost"
          onClick={importPerFile}
          disabled={importing || DICT_FILE_NAMES.some((n) => !perFileSelection[n])}
        >
          {importing ? 'Reading files…' : 'Import these six files'}
        </button>
      </div>
      {importError && (
        <div className="settings-aramorph__error" role="alert">
          {importError}
        </div>
      )}
    </div>
  );
}
