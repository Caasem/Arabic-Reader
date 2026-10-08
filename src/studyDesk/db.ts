import Dexie, { type Table } from 'dexie';
import type { Desk, DeskItem } from './types';

/**
 * The study desk's own database, apart from the main one so the feature can be removed by deleting this
 * folder. Local to this device until sync covers it (declared in src/storage/registry.ts, in the full export).
 */
export class DeskDB extends Dexie {
  items!: Table<DeskItem, string>;
  desks!: Table<Desk, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-desk') {
    super(name);
    this.version(1).stores({
      items: 'id, deskId, createdAt',
      desks: 'id, bookId',
    });
  }
}
