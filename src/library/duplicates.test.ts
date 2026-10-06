import { describe, expect, it } from 'vitest';
import type { BookMeta } from '../types';
import { hiddenDuplicateIds } from './duplicates';

const book = (id: string, over: Partial<BookMeta> = {}): BookMeta => ({
  id,
  title: 'تارادا',
  author: 'كامل كيلاني',
  format: 'epub',
  addedAt: 1,
  sizeBytes: 1000,
  ...over,
});

describe('hiddenDuplicateIds', () => {
  it('hides the file-less copy of a book that is also here with its file', () => {
    const books = [book('mine'), book('stub')];
    expect(hiddenDuplicateIds(books, new Set(['mine']))).toEqual(new Set(['stub']));
  });

  it('keeps a file-less book that has no real copy here, so it can be given its file', () => {
    const books = [book('stub')];
    expect(hiddenDuplicateIds(books, new Set())).toEqual(new Set());
  });

  it('only matches the same book: title, author and size must all agree', () => {
    const books = [
      book('mine'),
      book('other-title', { title: 'قصص النبيين' }),
      book('other-author', { author: 'someone else' }),
      book('other-size', { sizeBytes: 2000 }),
      book('no-author-a', { author: undefined, title: 'X' }),
    ];
    expect(hiddenDuplicateIds(books, new Set(['mine']))).toEqual(new Set());
  });

  it('never hides a book that has its file, even if two copies exist', () => {
    const books = [book('a'), book('b')];
    expect(hiddenDuplicateIds(books, new Set(['a', 'b']))).toEqual(new Set());
  });

  it('hides nothing until it knows which files are here', () => {
    expect(hiddenDuplicateIds([book('a'), book('b')], null)).toEqual(new Set());
  });
});
