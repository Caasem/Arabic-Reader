import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta } from '../types';
import { persistenceService } from '../persistence/db';
import type { SensePickRow } from '../persistence/sensePicksRepo';
import { bookKey } from '../sensePicks';
import { buildSavedEntriesExport, savedEntriesFileName } from './buildExport';

declare const __APP_VERSION__: string;

const PREVIEW_ROWS = 6;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Alt+P panel: the entries saved from this book, and a button that writes them to a file to send on. */
export function PicksExportPanel({ book, onClose }: { book: BookMeta; onClose(): void }) {
  const [rows, setRows] = useState<SensePickRow[] | null>(null);
  const [notice, setNotice] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const key = useMemo(() => bookKey(book), [book]);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let stale = false;
    void persistenceService.getSensePicksForBook(key).then((list) => !stale && setRows(list));
    panelRef.current?.focus();
    return () => {
      stale = true;
    };
  }, [key]);

  const file = useMemo(
    () => (rows ? buildSavedEntriesExport(book, key, rows, { now: openedAt, appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev' }) : null),
    [rows, book, key, openedAt],
  );
  const text = file ? JSON.stringify(file, null, 2) : '';
  const count = rows?.length ?? 0;
  const preview = (file?.words ?? []).flatMap((w) => w.saves.map((s) => ({ word: w.word, ...s }))).slice(0, PREVIEW_ROWS);

  function save() {
    if (!file || count === 0) return;
    download(savedEntriesFileName(book.title, Date.now()), text);
    setNotice('File saved. Send it to the person running the test.');
  }

  async function copy() {
    if (!file || count === 0) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied. Paste it into a message or a file.');
    } catch {
      setNotice('Copying is not allowed here. Use Save file instead.');
    }
  }

  return (
    <aside
      ref={panelRef}
      className="pexport"
      aria-label="Share saved entries"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="pexport__header">
        <span className="pexport__title">Saved entries · this book</span>
        <kbd className="pexport__key">Alt P</kbd>
        <button type="button" className="pexport__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="pexport__body">
        <p className="pexport__summary">
          {rows === null
            ? 'Loading…'
            : count === 0
              ? 'Nothing yet. Save a dictionary entry with its round + while reading this book.'
              : `${count} saved ${count === 1 ? 'entry' : 'entries'} across ${file?.words.length} ${file?.words.length === 1 ? 'word' : 'words'}.`}
        </p>

        <p className="pexport__note">
          The file lists which dictionary entries you saved for each word of this book, and the day. It does not include your sentences, notes,
          flashcards, review history, other books, or your name.
        </p>

        {preview.length > 0 && (
          <div className="pexport__preview" aria-label="What the file contains">
            <div className="pexport__label">A few lines from the file</div>
            {preview.map((p, i) => (
              <div key={i} className="pexport__line">
                <span lang="ar" dir="rtl" className="pexport__word">
                  {p.word}
                </span>
                <span>{p.dictionary}</span>
                <span lang="ar" dir="rtl">
                  {p.headword ?? ''} {p.verbForm ? `(${p.verbForm})` : ''}
                </span>
                <span className="pexport__day">{p.day}</span>
              </div>
            ))}
            {count > preview.length && <div className="pexport__more">and {count - preview.length} more</div>}
          </div>
        )}

        <div className="pexport__actions">
          <button type="button" className="pexport__btn pexport__btn--primary" disabled={count === 0} onClick={save}>
            Save file
          </button>
          <button type="button" className="pexport__btn" disabled={count === 0} onClick={() => void copy()}>
            Copy
          </button>
        </div>
        {notice && (
          <p className="pexport__notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </aside>
  );
}
