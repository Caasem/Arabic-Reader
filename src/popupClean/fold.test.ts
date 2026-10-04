import { describe, expect, it } from 'vitest';
import { arabicEntriesStartFolded } from './index';

describe('arabicEntriesStartFolded', () => {
  it('keeps one or two Arabic entries open', () => {
    expect(arabicEntriesStartFolded(0, true)).toBe(false);
    expect(arabicEntriesStartFolded(1, true)).toBe(false);
    expect(arabicEntriesStartFolded(2, true)).toBe(false);
  });

  it('folds three or more, unless the setting is off', () => {
    expect(arabicEntriesStartFolded(3, true)).toBe(true);
    expect(arabicEntriesStartFolded(5, true)).toBe(true);
    expect(arabicEntriesStartFolded(3, false)).toBe(false);
  });
});
