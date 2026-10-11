// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadColor, saveColor } from './color';

describe('note colour', () => {
  beforeEach(() => localStorage.clear());

  it('reads a colour saved before 0.96 (same key, plain string)', () => {
    localStorage.setItem('noteCard.color', 'green');
    expect(loadColor()).toBe('green');
  });

  it('falls back to yellow when nothing or something unknown is stored', () => {
    expect(loadColor()).toBe('yellow');
    localStorage.setItem('noteCard.color', 'mauve');
    expect(loadColor()).toBe('yellow');
  });

  it('saves under the same key', () => {
    saveColor('purple');
    expect(localStorage.getItem('noteCard.color')).toBe('purple');
  });
});
