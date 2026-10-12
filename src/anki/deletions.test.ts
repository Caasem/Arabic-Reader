// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { VocabularyItem } from '../types';
import { clearAnkiDeletes, pendingAnkiDeletes, rememberAnkiDeletes } from './deletions';

const card = (ankiNoteId?: number) => ({ ankiNoteId }) as VocabularyItem;

describe('Anki notes waiting to be deleted', () => {
  beforeEach(() => localStorage.clear());

  it('reads a list saved the old way, under the same key', () => {
    localStorage.setItem('anki.pendingDeletes', JSON.stringify([11, 22]));
    expect(pendingAnkiDeletes()).toEqual([11, 22]);
  });

  it('writes under the same key, as a JSON array without repeats', () => {
    localStorage.setItem('anki.pendingDeletes', JSON.stringify([11]));
    rememberAnkiDeletes([card(22), undefined, card(), card(11)]);
    expect(JSON.parse(localStorage.getItem('anki.pendingDeletes')!)).toEqual([11, 22]);
    clearAnkiDeletes([11]);
    expect(JSON.parse(localStorage.getItem('anki.pendingDeletes')!)).toEqual([22]);
  });

  it('writes nothing when no card had a note', () => {
    rememberAnkiDeletes([card(), undefined]);
    expect(localStorage.getItem('anki.pendingDeletes')).toBeNull();
  });

  it('falls back to an empty list when missing, broken or not a list', () => {
    expect(pendingAnkiDeletes()).toEqual([]);
    localStorage.setItem('anki.pendingDeletes', '{oops');
    expect(pendingAnkiDeletes()).toEqual([]);
    localStorage.setItem('anki.pendingDeletes', '{"a":1}');
    expect(pendingAnkiDeletes()).toEqual([]);
    localStorage.setItem('anki.pendingDeletes', '[1,"x",2]');
    expect(pendingAnkiDeletes()).toEqual([1, 2]);
  });
});
