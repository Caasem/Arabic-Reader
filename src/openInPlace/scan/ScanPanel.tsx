import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeKey } from '../../components/shared/useEscapeKey';
import { DuplicateBookError, libraryService } from '../../library/libraryService';
import { usePreferences } from '../../state/PreferencesContext';
import { getFilesBridge, getScanBridge, type ScanResult } from '../../sync/desktopBridge';
import { addScanned, describeAdd } from './addScanned';
import { DEFAULT_FORMATS, FORMAT_LABEL, OPENS_IN_PLACE, SCAN_FORMATS, filterRows, formatSize, libraryHashes, shortFolder, sortRows, toRows, type ScanSort } from './scanModel';
import { VirtualRows } from './VirtualRows';
import './scan.css';

const ROW_HEIGHT = 40;

const COLUMNS: { sort: ScanSort; label: string }[] = [
  { sort: 'name', label: 'Name' },
  { sort: 'folder', label: 'Folder' },
  { sort: 'size', label: 'Size' },
  { sort: 'date', label: 'Modified' },
];

/**
 * Library → Find books on this computer (desktop only). Lists every PDF and EPUB, and MOBI, AZW3, TXT and Markdown
 * files, in the usual places and any folders the reader adds. A PDF or EPUB opens where it is; ticked rows are added
 * to the library the ordinary way. Only names, sizes and dates are read until a book is opened.
 */
export default function ScanPanel({ onClose, onLibraryChanged }: { onClose(): void; onLibraryChanged(): void }) {
  useEscapeKey(onClose, true);
  const { prefs } = usePreferences();
  const pdfConvert = useRef(prefs.pdfConvertToText);
  useEffect(() => {
    pdfConvert.current = prefs.pdfConvertToText;
  }, [prefs.pdfConvertToText]);

  const [results, setResults] = useState<ScanResult[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [counts, setCounts] = useState({ checked: 0, found: 0 });
  const [known, setKnown] = useState<{ path: string; hash: string }[]>([]);
  const [hashes, setHashes] = useState<Set<string>>(new Set());
  const [formats, setFormats] = useState<Set<string>>(new Set(DEFAULT_FORMATS));
  const [folder, setFolder] = useState('');
  const [text, setText] = useState('');
  const [hideInLibrary, setHideInLibrary] = useState(false);
  const [sort, setSort] = useState<ScanSort>('name');
  const [descending, setDescending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const refreshLibrary = useCallback(async () => {
    const [files, books] = await Promise.all([getFilesBridge()?.known().catch(() => []) ?? [], libraryService.listBooks()]);
    if (!live.current) return;
    setKnown(files);
    setHashes(libraryHashes(books));
  }, []);

  const scan = useCallback(async () => {
    const bridge = getScanBridge();
    if (!bridge) return;
    setError(null);
    setMessage(null);
    setResults([]);
    setSelected(new Set());
    setCounts({ checked: 0, found: 0 });
    setScanning(true);
    try {
      await bridge.start();
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : 'The search could not finish.');
    }
    const state = await bridge.results().catch(() => null);
    if (!live.current) return;
    setScanning(false);
    if (state) {
      setResults(state.results);
      setRoots(state.roots);
      setExtraFolders(state.extraFolders);
      setScannedAt(state.scannedAt);
      setCounts((c) => ({ ...c, found: state.results.length }));
    }
  }, []);

  useEffect(() => {
    live.current = true;
    const bridge = getScanBridge();
    if (!bridge) return;
    const off = bridge.onProgress((p) => {
      if (!live.current) return;
      setCounts({ checked: p.checked, found: p.found });
      if (p.added.length) setResults((prev) => prev.concat(p.added));
    });
    void refreshLibrary();
    void bridge.results().then((state) => {
      if (!live.current) return;
      setResults(state.results);
      setRoots(state.roots);
      setExtraFolders(state.extraFolders);
      setScannedAt(state.scannedAt);
      setCounts({ checked: 0, found: state.results.length });
      // Nothing kept from before: look straight away.
      if (!state.scannedAt) void scan();
    });
    return () => {
      live.current = false;
      off();
      // Closing the panel ends a search in progress; what it found so far is kept.
      void bridge.stop();
    };
  }, [scan, refreshLibrary]);

  const rows = useMemo(() => toRows(results, known, hashes), [results, known, hashes]);
  const shown = useMemo(
    () => sortRows(filterRows(rows, { formats, folder: folder || null, text, hideInLibrary }), sort, descending),
    [rows, formats, folder, text, hideInLibrary, sort, descending]
  );
  const places = useMemo(() => [...roots, ...extraFolders.filter((f) => !roots.includes(f))], [roots, extraFolders]);
  const byFormat = useMemo(() => {
    const n: Record<string, number> = {};
    for (const r of results) n[r.format] = (n[r.format] ?? 0) + 1;
    return n;
  }, [results]);

  function toggleFormat(format: string) {
    setFormats((prev) => {
      const next = new Set(prev);
      if (!next.delete(format)) next.add(format);
      return next;
    });
  }

  function toggleSort(next: ScanSort) {
    if (sort === next) setDescending((d) => !d);
    else {
      setSort(next);
      setDescending(false);
    }
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  async function open(path: string) {
    setError(null);
    try {
      await getScanBridge()?.openResult(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be opened.');
    }
  }

  async function addFolder() {
    const bridge = getScanBridge();
    if (!bridge) return;
    const before = extraFolders.length;
    const next = await bridge.addFolder();
    setExtraFolders(next);
    if (next.length > before) void scan();
  }

  async function removeFolder(path: string) {
    setExtraFolders(await (getScanBridge()?.removeFolder(path) ?? Promise.resolve([])));
  }

  async function addSelected() {
    const bridge = getScanBridge();
    if (!bridge || selected.size === 0) return;
    setError(null);
    setMessage(null);
    const summary = await addScanned(
      [...selected],
      {
        read: (path) => bridge.readResult(path),
        importFile: (file) => libraryService.importBook(file, { pdfConvert: pdfConvert.current }),
        isDuplicate: (e) => e instanceof DuplicateBookError,
      },
      (done, total, name) => live.current && setAdding(`Adding ${done + 1} of ${total}: ${name}`)
    );
    if (!live.current) return;
    setAdding(null);
    setSelected(new Set());
    setMessage(describeAdd(summary));
    if (summary.failed.length) setError(summary.failed.join(' '));
    onLibraryChanged();
    await refreshLibrary();
  }

  const status = scanning
    ? `${counts.checked.toLocaleString()} files checked, ${counts.found.toLocaleString()} ${counts.found === 1 ? 'book' : 'books'} found`
    : scannedAt
      ? `${results.length.toLocaleString()} ${results.length === 1 ? 'book' : 'books'} found · ${new Date(scannedAt).toLocaleString()}`
      : '';

  return (
    <div className="oip-scan__backdrop" onClick={onClose}>
      <div className="oip-scan" role="dialog" aria-modal="true" aria-labelledby="oip-scan-title" onClick={(e) => e.stopPropagation()}>
        <div className="oip-scan__head">
          <h2 id="oip-scan-title">Find books on this computer</h2>
          <div className="oip-scan__status" role="status">
            {status}
          </div>
          {scanning ? (
            <button type="button" className="btn btn--ghost" onClick={() => void getScanBridge()?.stop()}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => void scan()}>
              {scannedAt ? 'Scan again' : 'Scan'}
            </button>
          )}
          <button type="button" className="oip-scan__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <details className="oip-scan__places">
          <summary>Where it looks ({places.length || '…'})</summary>
          <ul>
            {places.map((place) => (
              <li key={place} dir="auto">
                <span>{place}</span>
                {extraFolders.includes(place) && (
                  <button type="button" className="oip-scan__link" onClick={() => void removeFolder(place)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--ghost" onClick={() => void addFolder()}>
            Add a folder…
          </button>
        </details>

        <div className="oip-scan__filters">
          <div className="oip-scan__formats" role="group" aria-label="Formats">
            {SCAN_FORMATS.map((format) => (
              <button key={format} type="button" className="lib-chip" aria-pressed={formats.has(format)} onClick={() => toggleFormat(format)}>
                {FORMAT_LABEL[format]} <span className="lib-chip__n">{byFormat[format] ?? 0}</span>
              </button>
            ))}
          </div>
          <select className="library__sort" aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">All folders</option>
            {places.map((place) => (
              <option key={place} value={place}>
                {shortFolder(place)}
              </option>
            ))}
          </select>
          <input className="oip-scan__search" type="search" aria-label="Search by file name" placeholder="Search by file name" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="oip-scan__check">
            <input type="checkbox" checked={hideInLibrary} onChange={(e) => setHideInLibrary(e.target.checked)} />
            Hide books already in my library
          </label>
        </div>

        <div className="oip-scan__table" role="table" aria-label="Books found" aria-rowcount={shown.length}>
          <div className="oip-scan__cols oip-scan__cols--head" role="row">
            <span role="columnheader" />
            {COLUMNS.map((c) => (
              <button key={c.sort} type="button" role="columnheader" className={'oip-scan__sort oip-scan__sort--' + c.sort} onClick={() => toggleSort(c.sort)}>
                {c.label}
                {sort === c.sort && <span aria-hidden="true">{descending ? ' ↓' : ' ↑'}</span>}
              </button>
            ))}
            <span role="columnheader" className="oip-scan__col-state">
              Format
            </span>
          </div>
          {shown.length === 0 ? (
            <div className="oip-scan__empty">{scanning ? 'Looking…' : results.length === 0 ? 'No books found.' : 'No books match the filters.'}</div>
          ) : (
            <VirtualRows
              label="Books found"
              count={shown.length}
              rowHeight={ROW_HEIGHT}
              render={(i) => {
                const row = shown[i];
                const inPlace = OPENS_IN_PLACE.includes(row.format);
                return (
                  <div className="oip-scan__cols" role="presentation">
                    <input type="checkbox" role="cell" aria-label={`Select ${row.name}`} checked={selected.has(row.path)} onChange={() => toggleSelected(row.path)} />
                    <button type="button" role="cell" className="oip-scan__name" dir="auto" title={inPlace ? `Open ${row.path}` : `${row.path} (can only be added to the library)`} onClick={() => (inPlace ? void open(row.path) : toggleSelected(row.path))}>
                      {row.name}
                    </button>
                    <span role="cell" className="oip-scan__folder" dir="auto" title={row.folder}>
                      {shortFolder(row.folder)}
                    </span>
                    <span role="cell" className="oip-scan__num">
                      {formatSize(row.size)}
                    </span>
                    <span role="cell" className="oip-scan__num">
                      {new Date(row.mtime).toLocaleDateString()}
                    </span>
                    <span role="cell" className="oip-scan__col-state">
                      {FORMAT_LABEL[row.format] ?? row.format}
                      {row.inLibrary && <span className="oip-scan__in">In library</span>}
                    </span>
                  </div>
                );
              }}
            />
          )}
        </div>

        {error && (
          <div className="oip-scan__error" role="alert">
            {error}
          </div>
        )}
        <div className="oip-scan__foot">
          <span className="oip-scan__note" role="status">
            {adding ?? message ?? 'Click a PDF or EPUB to read it where it is. Tick books to add copies to your library.'}
          </span>
          <button type="button" className="btn btn--ghost" disabled={shown.length === 0} onClick={() => setSelected(new Set(shown.filter((r) => !r.inLibrary).map((r) => r.path)))}>
            Select all shown
          </button>
          <button type="button" className="btn btn--primary" disabled={selected.size === 0 || adding !== null} onClick={() => void addSelected()}>
            Add to library ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
