import { useEffect, useRef, useState } from 'react';
import { logDiagnostic } from '../../../diagnostics/diagnosticsLog';
import { personalDictionaryProvider } from '../../../dictionary/providers/personal/PersonalDictionaryProvider';
import { Note } from './controls';

interface Props {
  /** A file was loaded, so the dictionary should be switched on. */
  onImported(): void;
}

/** Loading the user's own dictionary file (kept only in this browser). */
export function PersonalDictionarySettings({ onImported }: Props) {
  const [info, setInfo] = useState<{ label: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void personalDictionaryProvider.getInfo().then((i) => !cancelled && setInfo(i));
    return () => {
      cancelled = true;
    };
  }, []);

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await personalDictionaryProvider.importFile(file);
      setInfo(await personalDictionaryProvider.getInfo());
      onImported();
    } catch (e) {
      logDiagnostic('error', 'dictionary', 'Personal dictionary import failed', e);
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await personalDictionaryProvider.clear();
      setInfo(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-aramorph">
      <Note>
        <strong>Your own dictionary.</strong> Load a dictionary file you own (for example a Russian-Arabic dictionary) for
        personal use. It is read on this device and stored only in your browser — never uploaded or bundled. Accepted:{' '}
        <code>.tsv</code>/<code>.txt</code> (<code>headword⇥definition</code> per line), <code>.csv</code>, <code>.json</code>,
        and Lingvo <code>.dsl</code>. Words are matched by headword, including via the root and dictionary form found by
        AraMorph.
      </Note>
      <div className="settings-aramorph__actions">
        <button className="btn btn--ghost" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Reading file…' : info ? 'Replace dictionary file' : 'Load dictionary file'}
        </button>
        {info && (
          <button className="btn btn--ghost" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
        {info && (
          <span className="settings-badge settings-badge--ready">
            {info.label} · {info.count.toLocaleString()} entries
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".tsv,.txt,.csv,.json,.dsl,text/*,application/json"
          hidden
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </div>
      {error && (
        <div className="settings-aramorph__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
