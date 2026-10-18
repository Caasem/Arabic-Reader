import Dexie, { type Table } from 'dexie';
import type { CardRec, NodeRec } from './types';

/**
 * Nodes keep their own database, apart from the main one, so the feature can be removed by deleting this folder.
 * Local to this device until sync covers it (declared in src/storage/registry.ts, in the full export).
 */
export class NodesDB extends Dexie {
  nodes!: Table<NodeRec, string>;
  cards!: Table<CardRec, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-nodes') {
    super(name);
    this.version(1).stores({
      nodes: 'id, bookId, parentId',
      cards: 'id, bookId, parentId',
    });
  }
}
