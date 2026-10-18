import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostProps } from '../features/registry';
import { useChordHotkey } from '../readerChords';
import { refreshReaderTools, registerReaderTool } from '../readerTools';
import { usePreferences } from '../state/PreferencesContext';
import type { NodeStyle } from './types';
import { IconNodeList, IconNodeTool } from './icons';
import { buildTree } from './model';
import { NodeList } from './NodeList';
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
  const [listOpen, setListOpen] = useState(false);
  const addingRef = useRef(adding);
  const listRef = useRef(listOpen);
  useEffect(() => {
    addingRef.current = adding;
    listRef.current = listOpen;
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
  // The list of every node in the book.
  useEffect(
    () =>
      registerReaderTool({
        id: 'nodes:list',
        label: 'Nodes',
        title: 'All the nodes in this book',
        keys: 'Alt+Shift+O',
        group: 'ink',
        order: 3,
        readers: ['clean', 'pdf'],
        icon: <IconNodeList />,
        isOn: () => listRef.current,
        run: () => setListOpen((o) => !o),
      }),
    []
  );
  useEffect(() => refreshReaderTools(), [adding, listOpen]);

  useChordHotkey('KeyO', true, () => setAdding((a) => !a));
  useChordHotkey('KeyO', true, () => setListOpen((o) => !o), true);

  // Esc puts the node down without placing one.
  useEffect(() => {
    if (!adding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdding(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding]);

  // Esc closes the list, unless a title or a card is being typed.
  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).isContentEditable) setListOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen]);

  return (
    <>
      <NodesLayer book={book} rows={rows} tree={tree} adding={adding} defaultStyle={defaultStyle} onAdded={() => setAdding(false)} />
      {listOpen && <NodeList rows={rows} onClose={() => setListOpen(false)} />}
    </>
  );
}
