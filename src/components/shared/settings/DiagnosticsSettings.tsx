import { useEffect, useState, useSyncExternalStore } from 'react';
import { dictionaryManager } from '../../../dictionary/DictionaryManager';
import { aramorphProvider } from '../../../dictionary/providers/aramorph/AramorphDictionaryProvider';
import {
  clearDiagnostics,
  formatDiagnosticsReport,
  getDiagnostics,
  subscribeDiagnostics,
} from '../../../diagnostics/diagnosticsLog';
import { Note, SettingsSection } from './controls';

const TEST_WORD = 'كان';
const SHOWN_ENTRIES = 20;

function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** TS's lib.dom types `navigator.storage` as always present, but older
 * browsers genuinely lack it -- feature-detect at runtime instead of
 * trusting the type. */
function hasStorageEstimate(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && typeof navigator.storage?.estimate === 'function';
}

export function DiagnosticsSettings() {
  const entries = useSyncExternalStore(subscribeDiagnostics, getDiagnostics);
  const [storage, setStorage] = useState(() => (hasStorageEstimate() ? 'Checking…' : 'Unavailable'));
  const [testResult, setTestResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);

  useEffect(() => {
    if (!hasStorageEstimate()) return;
    let cancelled = false;
    navigator.storage
      .estimate()
      .then(({ usage = 0, quota = 0 }) => {
        if (!cancelled) setStorage(`${formatBytes(usage)} of ${formatBytes(quota)}`);
      })
      .catch(() => {
        if (!cancelled) setStorage('Unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sizes = aramorphProvider.tableSizes;
  const info: Record<string, string> = {
    'App version': __APP_VERSION__,
    'Installed app': window.matchMedia?.('(display-mode: standalone)').matches ? 'Yes' : 'No',
    'Storage used': storage,
    'AraMorph status': aramorphProvider.status,
    'AraMorph tables': sizes
      ? Object.entries(sizes)
          .map(([table, count]) => `${table} ${count}`)
          .join(', ')
      : 'Not loaded',
    Browser: navigator.userAgent,
  };

  async function testLookup() {
    setTestResult('Looking up…');
    const result = await dictionaryManager.lookup(TEST_WORD);
    const count = result.entries.length;
    const gloss = result.entries[0]?.senses[0]?.gloss;
    const failed = result.failedProviders?.map((p) => p.name).join(', ');
    setTestResult(
      `${TEST_WORD}: ${count} ${count === 1 ? 'entry' : 'entries'}` +
        (gloss ? ` — ${gloss}` : '') +
        (failed ? ` (couldn't load: ${failed})` : '')
    );
  }

  async function copyReport() {
    const report = formatDiagnosticsReport(info, entries);
    try {
      await navigator.clipboard.writeText(report);
      setReportText(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setReportText(report); // clipboard blocked: show it for manual copying
    }
  }

  return (
    <SettingsSection title="Diagnostics">
      <Note>
        Problems this app runs into are logged here, on this device only — nothing is sent anywhere. If something
        isn't working, copy the report and include it when describing the problem.
      </Note>
      <dl className="settings-diagnostics__info">
        {Object.entries(info).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={testLookup}>
          Test dictionary lookup
        </button>
        <button className="btn btn--ghost" onClick={copyReport}>
          {copied ? 'Copied' : 'Copy report'}
        </button>
        <button className="btn btn--ghost" onClick={clearDiagnostics} disabled={entries.length === 0}>
          Clear log
        </button>
      </div>
      {testResult && (
        <p className="settings-section__note" role="status">
          {testResult}
        </p>
      )}
      {reportText && (
        <textarea
          className="settings-diagnostics__report"
          readOnly
          rows={8}
          value={reportText}
          aria-label="Diagnostics report"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {entries.length === 0 ? (
        <Note>No problems logged.</Note>
      ) : (
        <ol className="settings-diagnostics__log" aria-label="Recent problems, newest first">
          {entries
            .slice(-SHOWN_ENTRIES)
            .reverse()
            .map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className={'settings-diagnostics__entry settings-diagnostics__entry--' + entry.level}
              >
                <span className="settings-diagnostics__time">{new Date(entry.at).toLocaleString()}</span>
                <span className="settings-diagnostics__source">{entry.source}</span>
                <span className="settings-diagnostics__message">{entry.message}</span>
              </li>
            ))}
        </ol>
      )}
    </SettingsSection>
  );
}
