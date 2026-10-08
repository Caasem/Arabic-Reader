import { describe, expect, it } from 'vitest';
import { parseIndex, parsePathList, searchCatalog, datasetUrl } from './catalog';
import { addedKey, formatBytes, splitPages, volumeTitle, volumesToChapters } from './download';
import { putBooksOnShelf } from '../components/library/shelves';

const TSV = [
  'category\tauthor\ttitle\tpages\tvolumes\tpdf_paths\ttxt_paths\tdocx_paths',
  "علوم القرآن\tحسين نصار\tكتب غريب القرآن الكريم\t31\t1\t['./pdf/a.pdf']\t['./txt/علوم/00031.PDF/الكتاب.txt']\t[]",
  "الحديث\tالنووي\tرياض الصالحين\t800\t2\t[]\t['./txt/h/1.txt', './txt/h/2.txt']\t[]",
  'x\ty\tno text\t1\t1\t[]\t[]\t[]',
].join('\n');

describe('browse library catalogue', () => {
  it('parses path lists and rows', () => {
    expect(parsePathList("['./a/b.txt', './c.txt']")).toEqual(['a/b.txt', 'c.txt']);
    const books = parseIndex(TSV, 'waqfeya');
    expect(books).toHaveLength(2);
    expect(books[1].txtPaths).toHaveLength(2);
    expect(books[1].volumes).toBe(2);
  });

  it('searches loosely across alef, ta marbuta and vowel marks', () => {
    const books = parseIndex(TSV, 'waqfeya');
    expect(searchCatalog(books, 'الصَّالحين', null, 10).shown.map((b) => b.title)).toEqual(['رياض الصالحين']);
    expect(searchCatalog(books, 'قران', null, 10).total).toBe(1);
    expect(searchCatalog(books, '', 'الحديث', 10).total).toBe(1);
  });

  it('encodes each path segment for the download URL', () => {
    expect(datasetUrl('o/d', 'txt/علوم قرآن/a b.txt')).toBe(
      'https://huggingface.co/datasets/o/d/resolve/main/txt/' + encodeURIComponent('علوم قرآن') + '/' + encodeURIComponent('a b.txt'),
    );
  });
});

describe('browse library conversion', () => {
  it('splits on the page marker and numbers pages in chapters of ten', () => {
    const pages = splitPages('title\nPAGE_SEPARATOR\nfirst\nPAGE_SEPARATOR\n\nPAGE_SEPARATOR\nlast\n');
    expect(pages).toEqual(['title', 'first', '', 'last']);
    const chapters = volumesToChapters([Array.from({ length: 12 }, (_, i) => `p${i}`)], 'T');
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('T');
    expect(chapters[0].html).toContain('[ص 1]');
  });

  it('labels volumes when there are several', () => {
    const chapters = volumesToChapters([['a'], ['b']], 'T');
    expect(chapters[1].html).toContain('المجلد 2');
  });
});

describe('browse library formats and volumes', () => {
  it('keeps the PDF paths of each volume', () => {
    const books = parseIndex(TSV, 'waqfeya');
    expect(books[0].pdfPaths).toEqual(['pdf/a.pdf']);
    expect(books[1].pdfPaths).toEqual([]);
  });

  it('titles volumes of a multi-volume book, and a single volume plainly', () => {
    expect(volumeTitle('رياض الصالحين', 1, 3)).toBe('رياض الصالحين — المجلد 2');
    expect(volumeTitle('رياض الصالحين', 0, 1)).toBe('رياض الصالحين');
  });

  it('numbers a combined book by the volumes chosen, not by position', () => {
    const chapters = volumesToChapters([['a'], ['b']], 'T', [1, 3]);
    expect(chapters[0].html).toContain('المجلد 2');
    expect(chapters[1].html).toContain('المجلد 4');
  });

  it('keys one added file by book, format and volume', () => {
    const [book] = parseIndex(TSV, 'waqfeya');
    expect(addedKey(book, 'pdf', 2)).toBe(`${book.key}#pdf#2`);
  });

  it('formats sizes for the volume list', () => {
    expect(formatBytes(49537)).toBe('48 KB');
    expect(formatBytes(5 * 1048576)).toBe('5.0 MB');
    expect(formatBytes(300 * 1048576)).toBe('300 MB');
  });

  it('puts books on a shelf once', () => {
    const shelves = [{ id: 's', name: 'S', color: '#000', bookIds: ['a'] }];
    expect(putBooksOnShelf(shelves, 's', ['a', 'b', 'b'])[0].bookIds).toEqual(['a', 'b']);
  });
});
