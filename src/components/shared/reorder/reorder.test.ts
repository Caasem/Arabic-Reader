import { describe, expect, it } from 'vitest';
import { dropIndex, moveToIndex } from './reorder';

describe('moveToIndex', () => {
  it('moves an item forward and back', () => {
    expect(moveToIndex(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveToIndex(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('clamps the target to the ends', () => {
    expect(moveToIndex(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(moveToIndex(['a', 'b', 'c'], 'b', -4)).toEqual(['b', 'a', 'c']);
  });
  it('returns an unchanged copy for the same slot or an unknown id', () => {
    const src = ['a', 'b', 'c'];
    expect(moveToIndex(src, 'b', 1)).toEqual(src);
    expect(moveToIndex(src, 'b', 1)).not.toBe(src);
    expect(moveToIndex(src, 'z', 0)).toEqual(src);
  });
  it('does not mutate its input', () => {
    const src = ['a', 'b', 'c'];
    moveToIndex(src, 'a', 2);
    expect(src).toEqual(['a', 'b', 'c']);
  });
});

describe('dropIndex', () => {
  it('counts the other items whose centre is before the pointer', () => {
    const mids = [10, 30, 50];
    expect(dropIndex(mids, (m) => m < 5)).toBe(0);
    expect(dropIndex(mids, (m) => m < 35)).toBe(2);
    expect(dropIndex(mids, (m) => m < 99)).toBe(3);
  });
  it('works for a right-to-left axis (before = larger coordinate)', () => {
    const mids = [90, 60, 30];
    expect(dropIndex(mids, (m) => m > 70)).toBe(1);
  });
});
