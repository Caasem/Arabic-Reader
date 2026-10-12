// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPos, savePos } from './shellPos';

describe('the position a floating shell was left at', () => {
  beforeEach(() => localStorage.clear());

  it('reads positions saved the old way, under each shell key', () => {
    localStorage.setItem('dictionarySearch.floatingPos', JSON.stringify({ x: 10, y: 20 }));
    localStorage.setItem('studyDesk.inboxPos', JSON.stringify({ x: 1, y: 2 }));
    localStorage.setItem('studyDesk.pullPos', JSON.stringify({ x: 3, y: 4 }));
    expect(loadPos('dictionarySearch.floatingPos')).toEqual({ x: 10, y: 20 });
    expect(loadPos('studyDesk.inboxPos')).toEqual({ x: 1, y: 2 });
    expect(loadPos('studyDesk.pullPos')).toEqual({ x: 3, y: 4 });
  });

  it('writes under the same key, as JSON', () => {
    savePos('studyDesk.pullPos', { x: 5, y: 6 });
    expect(localStorage.getItem('studyDesk.pullPos')).toBe('{"x":5,"y":6}');
  });

  it('falls back to nothing when missing, empty or broken', () => {
    expect(loadPos('dictionarySearch.floatingPos')).toBeNull();
    localStorage.setItem('dictionarySearch.floatingPos', '');
    expect(loadPos('dictionarySearch.floatingPos')).toBeNull();
    localStorage.setItem('dictionarySearch.floatingPos', '{oops');
    expect(loadPos('dictionarySearch.floatingPos')).toBeNull();
  });
});
