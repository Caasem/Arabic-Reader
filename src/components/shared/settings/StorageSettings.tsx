import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { buildExport, estimateBookFiles, ExportCancelled, ExportFormatError, exportFilename, importExport, type ImportSummary } from '../../../dataExport';
import { libraryService } from '../../../library/libraryService';
import { getPackManager } from '../../../packManager';
import { bookFileMigrationStatus, subscribeBookFileMigration } from '../../../persistence/bookFileMigration';
import { removeUserFont } from '../../../readerFont/userFonts';
import { clearCaches, formatBytes, measureStorage, requestPersistentStorage, type StorageReport, type UsageItem } from '../../../storage/usage';
import { invalidateTokenStream } from '../../../speedReader';
import { invalidateBookVocabIndex } from '../../../vocabRarity/bookVocabIndex';
import { saveFile } from '../../../utils/saveFile';
import { Note, SettingsSection } from './controls';
import { personalDictionaryProvider } from '../../../dictionary/providers/personal/PersonalDictionaryProvider';
import './StorageSettings.css';

declare const __APP_VERSION__: string;

const GROUP_CLASS: Record<string, string> = { files: 'files', records: 'records', packs: 'packs', caches: 'caches' };

function summarise(s: ImportSummary): string {
  const written = Object.values(s.tables).reduce((n, t) => n + t.written, 0);
  const kept = Object.values(s.tables).reduce((n, t) => n + t.kept, 0);
  const parts = [`Restored ${written} ${written === 1 ? 'item' : 'items'}`];
  if (kept) parts.push(`${kept} already here or newer were kept`);
  if (s.booksRestored) parts.push(`${s.booksRestored} book ${s.booksRestored === 1 ? 'file' : 'files'} added`);
  if (s.skipped) parts.push(`${s.skipped} unusable ${s.skipped === 1 ? 'row' : 'rows'} skipped`);
  return parts.join('. ') + '.';
}

/**
 * Settings → Library & data → Storage: where the space goes, safe ways to free it, and a full export of
 * everything the reader made (docs/features/storage-ux.md). Also shows book files moving to the new store.
 */
export function StorageSettings() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const migration = useSyncExternalStore(subscribeBookFileMigration, bookFileMigrationStatus);

  const refresh = useCallback(async () => {
    setReport(await measureStorage().catch(() => null));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void measureStorage()
      .then((r) => !cancelled && setReport(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [migration.state, migration.moved]);

  async function act(done: string, work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const remove = (item: UsageItem) => {
    if (item.kind === 'book') {
      const choice = window.confirm(
        `Remove the file of "${item.label}" from this device?\n\nThe book stays in your library with its notes, highlights and progress, and you can add the file again later.` +
          '\n\nIf another book has an identical file, that copy is kept.',
      );
      if (choice) void act(`Removed the file of "${item.label}".`, () => libraryService.removeBookFileOnly(item.id));
    } else if (item.kind === 'pack') {
      if (window.confirm(`Remove "${item.label}" from this device?\n\nYou can download it again later. Until then lookups use any copy built into the app.`)) {
        void act(`Removed "${item.label}".`, () => getPackManager().uninstall(item.id));
      }
    } else if (item.kind === 'font') {
      if (window.confirm(`Remove the uploaded font "${item.id}"?\n\nYou would need the font file to add it again.`)) void act(`Removed ${item.id}.`, () => removeUserFont(item.id));
    } else if (item.kind === 'dictionary') {
      if (window.confirm('Remove your personal dictionary from this device?\n\nYou would need the original file to load it again.')) {
        void act('Removed your personal dictionary.', () => personalDictionaryProvider.clear());
      }
    }
  };

  const removeWholeBook = (item: UsageItem) => {
    if (!window.confirm(`Remove "${item.label}" from your library?\n\nIts file, highlights, bookmarks and progress go. Your saved vocabulary stays.`)) return;
    void act(`Removed "${item.label}".`, async () => {
      await libraryService.removeBook(item.id);
      invalidateBookVocabIndex(item.id);
      invalidateTokenStream(item.id);
    });
  };

  const canRemove = (item: UsageItem) => item.kind === 'book' || item.kind === 'pack' || item.kind === 'font' || item.kind === 'dictionary';
  const removeLabel = (item: UsageItem) => (item.kind === 'book' ? 'Remove file only' : 'Remove');

  const total = report?.groups.reduce((n, g) => n + g.bytes, 0) ?? 0;

  return (
    <SettingsSection title="Storage">
      {migration.state === 'running' && (
        <Note>
          Optimising storage… {migration.moved + migration.failed} of {migration.total} book files. You can keep reading; books not moved yet are read from where
          they were.
        </Note>
      )}
      {migration.state !== 'running' && migration.failed > 0 && (
        <Note>
          {migration.failed === 1 ? '1 book file could not be moved' : `${migration.failed} book files could not be moved`};{' '}
          {migration.failed === 1 ? 'it still works' : 'they still work'}. The app tries again the next time it starts.
        </Note>
      )}

      {!report ? (
        <Note>Measuring…</Note>
      ) : (
        <>
          <div className="storage-bar" role="img" aria-label="Space used by type">
            {report.groups.map((g) =>
              g.bytes > 0 ? <span key={g.id} className={`storage-bar__seg storage-bar__seg--${GROUP_CLASS[g.id]}`} style={{ flexGrow: g.bytes }} title={`${g.label}: ${formatBytes(g.bytes)}`} /> : null,
            )}
          </div>
          <Note>
            Arabic Reader uses about {formatBytes(total)} on this device
            {report.quota ? `. The browser reports ${formatBytes(report.quota.usage)} used of ${formatBytes(report.quota.quota)} available to this site.` : '.'} Sizes of your
            records are estimates.
          </Note>

          {report.groups.map((g) => (
            <div key={g.id} className="storage-group">
              <div className="storage-group__head">
                <span className={`storage-dot storage-bar__seg--${GROUP_CLASS[g.id]}`} aria-hidden />
                <strong>{g.label}</strong>
                <span className="storage-group__size">{formatBytes(g.bytes)}</span>
                {g.id === 'caches' && g.bytes > 0 && (
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act('Cleared the caches.', clearCaches)}>
                    Clear caches
                  </button>
                )}
              </div>
              {g.items.length === 0 ? (
                <p className="storage-empty">{g.id === 'packs' ? 'No downloaded packs. Dictionaries built into the app are not counted here.' : 'Nothing here.'}</p>
              ) : (
                <ul className="storage-items">
                  {g.items.slice(0, g.id === 'files' ? 50 : 12).map((item) => (
                    <li key={`${item.kind}:${item.id}`} className="storage-item">
                      <span className="storage-item__label">{item.label}</span>
                      <span className="storage-item__size">{formatBytes(item.bytes)}</span>
                      {canRemove(item) && (
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => remove(item)}>
                          {removeLabel(item)}
                        </button>
                      )}
                      {item.kind === 'book' && (
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => removeWholeBook(item)}>
                          Remove book
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div className="settings-row">
            <span className="settings-row__label">Protect from automatic cleanup</span>
            <span className="settings-row__control">
              {report.persisted ? (
                <span className="settings-badge settings-badge--ready">Protected</span>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() =>
                    void requestPersistentStorage().then(async (ok) => {
                      setMessage(ok ? 'Protected: the browser will not clear this data automatically.' : 'The browser declined. Installing the app to your home screen or using it often can help.');
                      await refresh();
                    })
                  }
                >
                  Protect
                </button>
              )}
            </span>
          </div>
          <Note>Browsers can clear a site&apos;s storage when the device is short of space. Protecting asks them not to; it is not a guarantee, so export your data now and then.</Note>
        </>
      )}

      <ExportImport onMessage={setMessage} onChanged={refresh} />
      {message && <p className="backup-controls__status" role="status">{message}</p>}
    </SettingsSection>
  );
}

function ExportImport({ onMessage, onChanged }: { onMessage(m: string | null): void; onChanged(): Promise<void> }) {
  const [includeBooks, setIncludeBooks] = useState(true);
  const [books, setBooks] = useState<{ count: number; bytes: number } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadNote, setReloadNote] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void estimateBookFiles().then((b) => !cancelled && setBooks(b)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function runExport() {
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    setExporting(true);
    onMessage(null);
    try {
      const result = await buildExport({
        includeBooks,
        appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
        signal: abort.signal,
        onProgress: (done, total) => setProgress(total ? `Adding books ${done} of ${total}…` : null),
      });
      const saved = await saveFile(exportFilename(), result.blob, 'application/zip');
      if (saved !== 'cancelled') {
        const note = result.booksWithoutFile ? ` ${result.booksWithoutFile} ${result.booksWithoutFile === 1 ? 'book has' : 'books have'} no file on this device, so only the record is included.` : '';
        onMessage(`Exported ${formatBytes(result.blob.size)}${includeBooks ? ` with ${result.books} book ${result.books === 1 ? 'file' : 'files'}` : ''}.${note}`);
      }
    } catch (e) {
      onMessage(e instanceof ExportCancelled ? 'Export cancelled.' : e instanceof Error ? e.message : 'The export failed.');
    } finally {
      abortRef.current = null;
      setProgress(null);
      setExporting(false);
      setBusy(false);
    }
  }

  async function runImport(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    onMessage(null);
    try {
      const summary = await importExport(file);
      onMessage(summarise(summary));
      setReloadNote(Object.values(summary.tables).some((t) => t.written > 0));
      await onChanged();
    } catch (e) {
      onMessage(e instanceof ExportFormatError || e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="storage-export">
      <h4>Export everything</h4>
      <Note>
        One .zip with your vocabulary, highlights, notes, bookmarks, history and settings (records.json), your words as a spreadsheet (vocabulary.csv), your highlights to
        read (highlights.md), and optionally the original books. All open formats. Importing it adds what is missing and never replaces anything newer.
      </Note>
      <label className="settings-toggle">
        <input type="checkbox" checked={includeBooks} onChange={(e) => setIncludeBooks(e.target.checked)} disabled={busy} />
        <span className="settings-toggle__label">
          Include book files{books ? ` (${books.count} ${books.count === 1 ? 'book' : 'books'}, about ${formatBytes(books.bytes)})` : ''}
        </span>
      </label>
      <div className="backup-controls__actions">
        <button type="button" className="btn btn--ghost" onClick={() => void runExport()} disabled={busy}>
          {exporting ? (progress ?? 'Exporting…') : 'Export everything'}
        </button>
        {exporting && (
          <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          Import an export
        </button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => void runImport(e.target.files)} />
      </div>
      {reloadNote && (
        <Note>
          Reload the app to apply restored settings.{' '}
          <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>
            Reload
          </button>
        </Note>
      )}
    </div>
  );
}
