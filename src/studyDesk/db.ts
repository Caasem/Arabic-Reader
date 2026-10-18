import Dexie, { type Table } from 'dexie';
import type { Desk, DeskItem, DeskLink, JournalEntry } from './types';

/**
 * The study desk's own database, apart from the main one so the feature can be removed by deleting this
 * folder. Local to this device until sync covers it (declared in src/storage/registry.ts, in the full export).
 */
export class DeskDB extends Dexie {
  items!: Table<DeskItem, string>;
  desks!: Table<Desk, string>;
  /** Muqābala links between two items (the thinking desk). */
  links!: Table<DeskLink, string>;
  /** The reading journal: a closing line per book closed (the thinking desk). */
  journal!: Table<JournalEntry, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-desk') {
    super(name);
    this.version(1).stores({
      items: 'id, deskId, createdAt',
      desks: 'id, bookId',
    });
    // The thinking desk (docs/features/thinking-front.md): threads index the items they hold; links and the
    // journal are new. Every new item field is optional, so version 1 rows need no change.
    this.version(2).stores({
      items: 'id, deskId, createdAt, *threads',
      desks: 'id, bookId',
      links: 'id, a, b',
      journal: 'id, at, bookId',
    });
  }
}
