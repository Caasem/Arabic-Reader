import { useMemo } from 'react';
import type { Rows } from './model';
import { addCard, addChildNode, patchNode, removeCard, removeNode, restoreRows, setCardText, setStyle } from './nodeStore';

/** Says something happened, with a way to take it back. */
export type Notify = (message: string, undo?: () => void) => void;

/** What the screen can ask of the store. Each takes ids, so the view never holds a stale row. */
export interface NodeActions {
  toggleOpen(id: string): void;
  togglePin(id: string): void;
  rename(id: string, title: string): void;
  /** Switches how a node opens (reticle or branch). */
  restyle(id: string): void;
  /** Attaches a new note; resolves to its id so the caller can start editing it. */
  addNote(parentId: string): Promise<string | null>;
  /** Attaches a new empty node that opens the way its parent does. */
  addBranch(parentId: string): Promise<string | null>;
  editCard(id: string, text: string): void;
  removeNode(id: string): void;
  removeCard(id: string): void;
}

export function useNodeActions(bookId: string, rows: Rows, notify: Notify): NodeActions {
  return useMemo(() => {
    const node = (id: string) => rows.nodes.find((n) => n.id === id);
    const card = (id: string) => rows.cards.find((c) => c.id === id);
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
      restyle(id) {
        const n = node(id);
        if (n) void setStyle(bookId, id, n.style === 'reticle' ? 'branch' : 'reticle');
      },
      async addNote(parentId) {
        return (await addCard(bookId, parentId, 'note', 'New note'))?.id ?? null;
      },
      async addBranch(parentId) {
        const parent = node(parentId);
        return parent ? ((await addChildNode(bookId, parentId, parent.style, 'New branch'))?.id ?? null) : null;
      },
      editCard(id, text) {
        const c = card(id);
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!c) return;
        if (!clean) {
          // An emptied card goes, and can be got back.
          void removeCard(id).then((row) => row && notify('Card deleted', () => void restoreRows({ nodes: [], cards: [row] })));
        } else if (clean !== c.text) void setCardText(id, clean);
      },
      removeNode(id) {
        void removeNode(bookId, id).then((removed) => removed.nodes.length && notify('Node deleted', () => void restoreRows(removed)));
      },
      removeCard(id) {
        void removeCard(id).then((row) => row && notify('Card deleted', () => void restoreRows({ nodes: [], cards: [row] })));
      },
    };
  }, [bookId, rows, notify]);
}
