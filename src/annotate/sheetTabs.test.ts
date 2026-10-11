// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { recallTab, rememberTab } from './sheets';

describe('the sheet tab remembered at each place', () => {
  beforeEach(() => localStorage.clear());

  it('reads tabs saved before 0.96 (same key, same JSON)', () => {
    localStorage.setItem('arabic-reader:sketch-tabs', JSON.stringify({ 'b|clean:2': 's1', 'b|pdf:7': 's2' }));
    expect(recallTab('b', { kind: 'clean', chapter: 2, start: 0, end: 0 })).toBe('s1');
    expect(recallTab('b', { kind: 'pdf', page: 7 })).toBe('s2');
    expect(recallTab('other', { kind: 'pdf', page: 7 })).toBeUndefined();
  });

  it('adds to what is stored, under the same key', () => {
    localStorage.setItem('arabic-reader:sketch-tabs', JSON.stringify({ 'b|clean:2': 's1' }));
    rememberTab('b', { kind: 'pdf', page: 3 }, 's9');
    expect(JSON.parse(localStorage.getItem('arabic-reader:sketch-tabs')!)).toEqual({ 'b|clean:2': 's1', 'b|pdf:3': 's9' });
  });

  it('copes with something unreadable stored there', () => {
    localStorage.setItem('arabic-reader:sketch-tabs', '{oops');
    expect(recallTab('b', { kind: 'pdf', page: 1 })).toBeUndefined();
    rememberTab('b', { kind: 'pdf', page: 1 }, 's1');
    expect(recallTab('b', { kind: 'pdf', page: 1 })).toBe('s1');
  });
});
