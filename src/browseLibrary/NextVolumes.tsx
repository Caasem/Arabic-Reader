import { useEffect, useState } from 'react';
import type { BookMeta } from '../types';
import { usePreferences } from '../state/PreferencesContext';
import { BROWSE_SOURCES, loadCatalog, type BrowseBook } from './catalog';
import { addBrowseBooks, addedBookIds, formatBytes, fileSize } from './download';
import './NextVolumes.css';

/**
 * In a book's details: for a book added from Browse library, the other volumes of it that are not on the shelf yet,
 * each with a button that adds it (in the same format as this volume, onto the same shelves).
 */
export function NextVolumes({ book, books, onAdded }: { book: BookMeta; books: BookMeta[]; onAdded(added: BookMeta[]): void }) {
  const { prefs, updatePrefs } = usePreferences();
  const ref = book.browse;
  const [entry, setEntry] = useState<BrowseBook | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<number, number | null>>({});

  useEffect(() => {
    if (!ref) return;
    let stale = false;
    setEntry(null);
    const source = BROWSE_SOURCES.find((s) => ref.key.startsWith(`${s.id}:`));
    if (source) {
      loadCatalog(source)
        .then((list) => !stale && setEntry(list.find((b) => b.key === ref.key) ?? null))
        .catch(() => {}); // offline and never opened Browse: there is nothing to offer
    }
    return () => {
      stale = true;
    };
  }, [ref]);

  useEffect(() => {
    if (!entry || !ref) return;
    let stale = false;
    for (let v = 0; v < entry.volumes; v++) void fileSize(entry, ref.format, v).then((n) => !stale && setSizes((s) => ({ ...s, [v]: n })));
    return () => {
      stale = true;
    };
  }, [entry, ref]);

  if (!ref || !entry) return null;
  const volumeCount = Math.max(entry.volumes, entry.txtPaths.length);
  if (volumeCount < 2) return null;

  // Which volumes of this book, in this format, are on the shelf: the books that name it, plus what Browse remembers.
  const ids = new Set(books.map((b) => b.id));
  const remembered = addedBookIds();
  const have = (v: number) => books.some((b) => b.browse?.key === ref.key && b.browse.format === ref.format && b.browse.volume === v) || (!!remembered[`${ref.key}#${ref.format}#${v}`] && ids.has(remembered[`${ref.key}#${ref.format}#${v}`]));
  const missing = Array.from({ length: volumeCount }, (_, v) => v).filter((v) => !have(v));

  async function add(volume: number) {
    if (!ref || !entry) return;
    setBusy(volume);
    setError(null);
    try {
      const result = await addBrowseBooks(entry, { format: ref.format, volumes: [volume], mode: 'separate' }, setStatus);
      if (result.books.length) {
        onAdded(result.books);
        // The new volume goes wherever this one is shelved.
        const newIds = result.books.map((b) => b.id);
        const shelves = prefs.libraryShelves.map((s) => (s.bookIds.includes(book.id) ? { ...s, bookIds: [...new Set([...s.bookIds, ...newIds])] } : s));
        if (prefs.libraryShelves.some((s) => s.bookIds.includes(book.id))) updatePrefs({ libraryShelves: shelves });
      }
      if (result.failed.length) setError(result.failed[0].message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that volume.');
    } finally {
      setBusy(null);
      setStatus('');
    }
  }

  return (
    <div className="lib-next">
      {missing.length === 0 ? (
        <div>
          <b>All {volumeCount} volumes are in your library.</b>
        </div>
      ) : (
        <>
          <div>
            <b>Volume {ref.volume + 1} of {volumeCount}.</b> {missing.length} not added yet.
          </div>
          <div className="lib-next__btns">
            {missing.map((v) => (
              <button key={v} type="button" className="lib-next__btn" disabled={busy !== null} onClick={() => void add(v)}>
                {busy === v ? status || 'Adding…' : `Add volume ${v + 1}`}
                {busy !== v && sizes[v] ? <small>{formatBytes(sizes[v] as number)}</small> : null}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <div className="lib-next__error">{error}</div>}
    </div>
  );
}
