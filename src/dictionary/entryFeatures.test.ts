import { describe, expect, it } from 'vitest';
import { FOLD_ABOVE, visibleEntryIndexes } from './entryFeatures';

describe('visibleEntryIndexes', () => {
  it('shows a short list whole', () => {
    const all = Array.from({ length: FOLD_ABOVE }, (_, i) => i + 10);
    expect(visibleEntryIndexes(all, new Set([11]))).toEqual(all);
  });

  it('folds a long list to the entries about the tapped word', () => {
    const all = [4, 5, 6, 7, 8, 9];
    expect(visibleEntryIndexes(all, new Set([7]))).toEqual([7]);
    expect(visibleEntryIndexes(all, new Set([5, 9, 99]))).toEqual([5, 9]);
  });

  it('shows the first entry when none matches', () => {
    expect(visibleEntryIndexes([4, 5, 6, 7, 8], new Set())).toEqual([4]);
    expect(visibleEntryIndexes([4, 5, 6, 7, 8], new Set([1]))).toEqual([4]);
  });
});
