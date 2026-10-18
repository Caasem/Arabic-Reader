import { useEffect, useState } from 'react';
import type { Rows } from './model';
import { bookRows, onNodesChange } from './nodeStore';

const EMPTY: Rows = { nodes: [], cards: [] };

/** A book's nodes and cards, read again whenever they change. */
export function useBookRows(bookId: string): Rows {
  const [loaded, setLoaded] = useState<{ bookId: string; rows: Rows } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void bookRows(bookId).then((r) => {
        if (live) setLoaded({ bookId, rows: r });
      });
    load();
    const off = onNodesChange(load);
    return () => {
      live = false;
      off();
    };
  }, [bookId]);
  return loaded?.bookId === bookId ? loaded.rows : EMPTY;
}
