import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostProps } from '../features/registry';
import { useChordHotkey } from '../readerChords';
import { refreshReaderTools, registerReaderTool } from '../readerTools';
import { usePreferences } from '../state/PreferencesContext';
import type { NodeStyle } from './types';
import { IconNodeTool } from './icons';
import { buildTree } from './model';
import { NodesLayer } from './NodesLayer';
import { useBookRows } from './useBookRows';

/** Mounted once beside the active reader (ReaderSwitch); renders nothing when switched off. */
export function NodesHost({ book }: HostProps) {
  const { prefs } = usePreferences();
  // Keyed by book, so a new book starts with nothing being placed.
  return prefs.nodesEnabled ? <Active key={book.id} bookId={book.id} book={book} defaultStyle={prefs.nodesDefaultStyle} /> : null;
}

function Active({ book, bookId, defaultStyle }: { book: HostProps['book']; bookId: string; defaultStyle: NodeStyle }) {
  const rows = useBookRows(bookId);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(adding);
  useEffect(() => {
    addingRef.current = adding;
  });

  // Node in the shared tool list: the dock (reader and PDF pages) and the Focus rail.
  useEffect(
    () =>
      registerReaderTool({
        id: 'nodes:add',
        label: 'Node',
        title: 'Add a node anywhere on the page',
        keys: 'Alt+O',
        group: 'ink',
        order: 2,
        readers: ['clean', 'pdf'],
        icon: <IconNodeTool />,
        isOn: () => addingRef.current,
        run: () => setAdding((a) => !a),
      }),
    []
  );
  useEffect(() => refreshReaderTools(), [adding]);

  useChordHotkey('KeyO', true, () => setAdding((a) => !a));

  // Esc puts the node down without placing one.
  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdding(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding]);

  return <NodesLayer book={book} rows={rows} tree={tree} adding={adding} defaultStyle={defaultStyle} onAdded={() => setAdding(false)} />;
}
