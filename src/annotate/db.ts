import Dexie, { type Table } from 'dexie';
import type { InkStroke, Sketch } from './types';

/**
 * Ink and sketches keep their own database, apart from the main one, so the feature can be removed by deleting
 * this folder. Local to this device until sync covers it (declared in src/storage/registry.ts, in the full export).
 */
export class InkDB extends Dexie {
  strokes!: Table<InkStroke, string>;
  sketches!: Table<Sketch, string>;
  /** `name` is only ever overridden by tests. */
  constructor(name = 'arabic-reader-ink') {
    super(name);
    this.version(1).stores({
      strokes: 'id, bookId',
      sketches: 'id, bookId',
    });
  }
}
