// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readTab, rememberTab } from './lastTab';

describe('the dictionary tab last chosen on the full page', () => {
  beforeEach(() => localStorage.clear());

  it('reads a tab saved the old way, under the same key', () => {
    localStorage.setItem('dictionaryPage.lastTab', 'alwasit');
    expect(readTab()).toBe('alwasit');
  });

  it('writes the id as a plain string under the same key', () => {
    rememberTab('baranov');
    expect(localStorage.getItem('dictionaryPage.lastTab')).toBe('baranov');
  });

  it('shows all dictionaries when nothing is stored', () => {
    expect(readTab()).toBe('all');
  });
});
