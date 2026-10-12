// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPos, savePos } from './position';

describe('the position a floating card was left at', () => {
  beforeEach(() => localStorage.clear());

  it('reads positions saved the old way, under each card key', () => {
    localStorage.setItem('noteCard.floatingPos', JSON.stringify({ x: 10, y: 20 }));
    localStorage.setItem('flashCard.floatingPos', JSON.stringify({ x: 1, y: 2 }));
    expect(loadPos('noteCard.floatingPos')).toEqual({ x: 10, y: 20 });
    expect(loadPos('flashCard.floatingPos')).toEqual({ x: 1, y: 2 });
  });

  it('writes under the same key, as JSON', () => {
    savePos('flashCard.floatingPos', { x: 5, y: 6 });
    expect(localStorage.getItem('flashCard.floatingPos')).toBe('{"x":5,"y":6}');
  });

  it('falls back to nothing when missing, empty or broken', () => {
    expect(loadPos('noteCard.floatingPos')).toBeNull();
    localStorage.setItem('noteCard.floatingPos', '');
    expect(loadPos('noteCard.floatingPos')).toBeNull();
    localStorage.setItem('noteCard.floatingPos', '{oops');
    expect(loadPos('noteCard.floatingPos')).toBeNull();
  });
});
