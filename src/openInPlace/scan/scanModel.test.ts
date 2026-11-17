import { describe, expect, it } from 'vitest';
import type { BookMeta } from '../../types';
import { DEFAULT_FORMATS, filterRows, folderOf, formatSize, libraryHashes, pathKey, shortFolder, sortRows, toRows, type ScanFilter } from './scanModel';

const result = (path: string, format = 'pdf', size = 100, mtime = 1) => ({ path, name: path.split(/[\\/]/).pop()!, format, size, mtime });
const all: ScanFilter = { formats: new Set(['pdf', 'epub', 'mobi', 'azw3', 'txt', 'md']), folder: null, text: '', hideInLibrary: false };

describe('scan paths', () => {
  it('finds the folder of a file, on either kind of path', () => {
    expect(folderOf('C:\\Users\\me\\Documents\\a.pdf')).toBe('C:\\Users\\me\\Documents');
    expect(folderOf('/home/me/Books/a.pdf')).toBe('/home/me/Books');
    expect(folderOf('/a.pdf')).toBe('/');
  });

  it('shortens a folder to its last two parts', () => {
    expect(shortFolder('C:\\Users\\me\\Documents\\Books')).toBe('…/Documents/Books');
    expect(shortFolder('/home/me')).toBe('/home/me');
  });

  it('compares Windows paths without case or slash direction, and others exactly', () => {
    expect(pathKey('C:/Users/Me/A.pdf')).toBe(pathKey('c:\\users\\me\\a.PDF'));
    expect(pathKey('/Home/a.pdf')).not.toBe(pathKey('/home/a.pdf'));
  });

  it('formats sizes', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(formatSize(40 * 1024 * 1024)).toBe('40 MB');
  });
});

describe('in library', () => {
  const book = (id: string, extra: Partial<BookMeta>): BookMeta => ({ id, title: id, format: 'epub', addedAt: 1, sizeBytes: 1, ...extra });

  it('takes the hashes of PDFs and EPUBs in the library', () => {
    const hashes = libraryHashes([book('a', { fileHash: 'h1' }), book('b', { pdf: { pages: 1, reflow: 'skipped', originalHash: 'h2' } }), book('c', {})]);
    expect([...hashes].sort()).toEqual(['h1', 'h2']);
  });

  it('marks a result only when its path is known and that file is a library book', () => {
    const results = [result('C:\\Books\\a.pdf'), result('C:\\Books\\b.pdf'), result('C:\\Books\\c.pdf')];
    const known = [
      { path: 'c:/books/a.pdf', hash: 'h1' },
      { path: 'C:\\Books\\b.pdf', hash: 'removed-from-library' },
    ];
    const rows = toRows(results, known, new Set(['h1']));
    expect(rows.map((r) => r.inLibrary)).toEqual([true, false, false]);
  });
});

describe('filtering and sorting', () => {
  const rows = toRows(
    [
      result('/docs/Alpha.pdf', 'pdf', 300, 30),
      result('/docs/sub/beta.epub', 'epub', 100, 10),
      result('/dl/Gamma 10.txt', 'txt', 200, 20),
      result('/dl/Gamma 2.mobi', 'mobi', 50, 40),
      result('/docsx/other.pdf', 'pdf', 10, 5),
    ],
    [{ path: '/docs/Alpha.pdf', hash: 'h' }],
    new Set(['h'])
  );

  it('has TXT and Markdown off by default', () => {
    expect(DEFAULT_FORMATS).not.toContain('txt');
    expect(DEFAULT_FORMATS).not.toContain('md');
    expect(filterRows(rows, { ...all, formats: new Set(DEFAULT_FORMATS) }).map((r) => r.name)).not.toContain('Gamma 10.txt');
  });

  it('filters by format, folder (whole folders only), file name and library', () => {
    expect(filterRows(rows, { ...all, formats: new Set(['epub']) }).map((r) => r.name)).toEqual(['beta.epub']);
    expect(filterRows(rows, { ...all, folder: '/docs' }).map((r) => r.name)).toEqual(['Alpha.pdf', 'beta.epub']);
    expect(filterRows(rows, { ...all, text: ' GAMMA ' }).map((r) => r.name)).toEqual(['Gamma 10.txt', 'Gamma 2.mobi']);
    expect(filterRows(rows, { ...all, hideInLibrary: true }).map((r) => r.name)).not.toContain('Alpha.pdf');
  });

  it('sorts by name (numbers as numbers), folder, size and date, either way', () => {
    expect(sortRows(rows, 'name', false).map((r) => r.name)).toEqual(['Alpha.pdf', 'beta.epub', 'Gamma 2.mobi', 'Gamma 10.txt', 'other.pdf']);
    expect(sortRows(rows, 'size', true).map((r) => r.size)).toEqual([300, 200, 100, 50, 10]);
    expect(sortRows(rows, 'date', false).map((r) => r.mtime)).toEqual([5, 10, 20, 30, 40]);
    expect(sortRows(rows, 'folder', false).map((r) => r.folder)).toEqual(['/dl', '/dl', '/docs', '/docs/sub', '/docsx']);
  });
});
