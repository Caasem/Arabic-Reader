// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readAdded, rememberAdded } from './added';

describe('the catalogue books already added to the library', () => {
  beforeEach(() => localStorage.clear());

  it('reads a map saved the old way, under the same key', () => {
    localStorage.setItem('browseLibrary.added', JSON.stringify({ 'k#txt#all': 'book-1' }));
    expect(readAdded()).toEqual({ 'k#txt#all': 'book-1' });
  });

  it('adds to what is stored, under the same key, as a JSON object', () => {
    localStorage.setItem('browseLibrary.added', JSON.stringify({ a: '1' }));
    rememberAdded('b', '2');
    expect(JSON.parse(localStorage.getItem('browseLibrary.added')!)).toEqual({ a: '1', b: '2' });
  });

  it('falls back to an empty map when missing or broken', () => {
    expect(readAdded()).toEqual({});
    localStorage.setItem('browseLibrary.added', '{oops');
    expect(readAdded()).toEqual({});
    rememberAdded('a', '1');
    expect(readAdded()).toEqual({ a: '1' });
  });
});
