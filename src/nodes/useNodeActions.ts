import { useMemo } from 'react';
import { patchNode } from './nodeStore';
import type { Rows } from './model';

/** What the screen can ask of the store. Each takes ids, so the view never holds a stale row. */
export interface NodeActions {
  toggleOpen(id: string): void;
  togglePin(id: string): void;
  rename(id: string, title: string): void;
}

export function useNodeActions(rows: Rows): NodeActions {
  return useMemo(() => {
    const node = (id: string) => rows.nodes.find((n) => n.id === id);
    return {
      toggleOpen(id) {
        const n = node(id);
        if (n) void patchNode(id, { open: !n.open });
      },
      togglePin(id) {
        const n = node(id);
        if (n) void patchNode(id, { pinTitle: !n.pinTitle });
      },
      rename(id, title) {
        const n = node(id);
        const clean = title.replace(/\s+/g, ' ').trim();
        if (n && clean && clean !== n.title) void patchNode(id, { title: clean });
      },
    };
  }, [rows]);
}
