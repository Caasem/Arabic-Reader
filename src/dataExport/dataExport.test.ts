import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBlobStoreForTests, type BlobStore } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { loadPersonalDictionary, savePersonalDictionary, clearPersonalDictionary } from '../dictionary/providers/personal/store';
import { persistenceService } from '../persistence';
import { db } from '../persistence/schema';
import { enableSyncCapture } from '../persistence/syncControl';
import { STORAGE_REGISTRY } from '../storage/registry';
import type { BookMeta, Highlight, VocabularyItem } from '../types';
import { csvField, vocabularyCsv } from './csv';
import { ExportCancelled, ExportFormatError, buildExport, importExport } from '.';
import { EXPORT_FORMAT_VERSION, bookFileName, bookIdFromFileName } from './format';
import { highlightsMarkdown } from './highlightsMd';
import { FILE_STORE_IDS, JSON_SPECS, RECORD_STORES } from './stores';

let n = 0;
let blobDb: BlobDB;
let store: BlobStore;

const book = (id: string, title = `Book ${id}`): BookMeta => ({ id, title, format: 'epub', addedAt: 1, sizeBytes: 8 });
const epub = (text: string) => new Blob([text], { type: 'application/epub+zip' });

const vocab = (id: string, extra: Partial<VocabularyItem> = {}): VocabularyItem =>
  ({
    id,
    surfaceForm: `كلمة${id}`,
    meaning: 'a word, "quoted"\nsecond line',
    root: 'كلم',
    lemma: 'كلمة',
    sentence: '=HYPERLINK("http://evil")',
    bookId: 'b1',
    bookTitle: 'Book b1',
    addedAt: Date.UTC(2026, 0, 2),
    lookupCount: 1,
    encounterCount: 1,
    mastery: 'learning',
    successfulRecalls: 0,
    fsrsDue: Date.UTC(2026, 0, 9),
    fsrsStability: 1,
    fsrsDifficulty: 1,
    fsrsScheduledDays: 1,
    fsrsLearningSteps: 0,
    fsrsReps: 0,
    fsrsLapses: 0,
    fsrsState: 0,
    entries: [],
    ...extra,
  }) as VocabularyItem;

const highlight = (id: string, extra: Partial<Highlight> = {}): Highlight => ({
  id,
  bookId: 'b1',
  bookTitle: 'Book b1',
  cfiRange: 'epubcfi(/6/2)',
  text: 'a passage\nover two lines',
  color: 'yellow',
  note: 'my note',
  createdAt: 100,
  updatedAt: 100,
  ...extra,
});

async function seed(): Promise<void> {
  await persistenceService.saveBook(book('b1'), epub('epub-one'));
  await persistenceService.saveBook(book('b2', 'Second: a/book?'), epub('epub-two'));
  await persistenceService.saveBook(book('b3'), epub('epub-three'));
  await persistenceService.removeBookFile('b3'); // a book whose file is not on this device
}

async function putSeedRecords(): Promise<void> {
  const { putSynced } = await import('../persistence/writeLayer');
  await putSynced('vocabulary', vocab('v1'));
  await putSynced('vocabulary', vocab('v2', { surfaceForm: 'ثان' }));
  await putSynced('highlights', highlight('h1'));
  await putSynced('bookmarks', { id: 'm1', bookId: 'b1', cfi: 'epubcfi(/6/4)', label: 'here', createdAt: 5 } as never);
  await putSynced('positions', { bookId: 'b1', cfi: 'epubcfi(/6/8)', percent: 0.4, updatedAt: 7 } as never);
  await db.wordInstances.put({ key: 'b1::كلمة', bookId: 'b1', normalizedForm: 'كلمة', surfaceForm: 'كلمة', encounterCount: 3, lookupCount: 1, firstSeenAt: 1, lastSeenAt: 50, saved: true } as never);
  await db.sensePicks.put({ key: 'p1', bookKey: 'b1', updatedAt: 9 } as never);
  await savePersonalDictionary('Mine', [['كتاب', 'book'] as never]);
}

async function wipe(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
  await blobDb.blobs.clear();
  await blobDb.blobIndex.clear();
  await clearPersonalDictionary();
}

const unzip = async (blob: Blob) => JSZip.loadAsync(blob);
const readJson = async (zip: JSZip, name: string) => JSON.parse(await zip.file(name)!.async('string')) as { formatVersion: number; tables: Record<string, Record<string, unknown>[]> };

beforeEach(async () => {
  await db.open();
  blobDb = new BlobDB(`export-test-${++n}`);
  store = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
  setBlobStoreForTests(store);
  await wipe();
});
afterEach(async () => {
  setBlobStoreForTests(null);
  await blobDb.delete();
});

const exportOptions = { appVersion: '0.37.0', now: () => Date.UTC(2026, 9, 7) };

describe('the registry and the export agree', () => {
  it('has a reader for every store marked for JSON export, and a file route for every original-file store', () => {
    const jsonIds = STORAGE_REGISTRY.filter((s) => s.kind === 'table' && s.exportFormat === 'json').map((s) => s.id);
    expect(RECORD_STORES.map((s) => s.id).sort()).toEqual(jsonIds.sort());
    expect(JSON_SPECS.map((s) => s.id).sort()).toEqual(jsonIds.sort());
    const fileIds = STORAGE_REGISTRY.filter((s) => s.exportFormat === 'original-file').map((s) => s.id);
    expect(fileIds.sort()).toEqual([...FILE_STORE_IDS].sort());
  });

  it('puts every one of those stores in the export', async () => {
    await seed();
    await putSeedRecords();
    const { blob } = await buildExport({ ...exportOptions, includeBooks: true });
    const zip = await unzip(blob);
    const records = await readJson(zip, 'records.json');
    for (const s of STORAGE_REGISTRY.filter((x) => x.kind === 'table' && x.exportFormat === 'json')) {
      expect(Object.keys(records.tables), s.id).toContain(s.id);
    }
    expect(Object.keys(zip.files).filter((f) => f.startsWith('books/')).length).toBeGreaterThan(0);
  });

  it('leaves out what the registry says stays on the device', async () => {
    await seed();
    const records = await readJson(await unzip((await buildExport({ ...exportOptions, includeBooks: false })).blob), 'records.json');
    for (const s of STORAGE_REGISTRY.filter((x) => x.kind === 'table' && x.exportFormat === 'none')) {
      expect(Object.keys(records.tables), s.id).not.toContain(s.id);
    }
  });
});

describe('export', () => {
  it('writes records, a spreadsheet, readable highlights and the original books', async () => {
    await seed();
    await putSeedRecords();
    const result = await buildExport({ ...exportOptions, includeBooks: true });
    expect(result).toMatchObject({ books: 2, booksWithoutFile: 1 });
    const zip = await unzip(result.blob);

    expect(Object.keys(zip.files).sort()).toEqual(
      ['README.txt', 'books/', 'books/Book b1__b1.epub', 'books/Second a book__b2.epub', 'highlights.md', 'records.json', 'vocabulary.csv'].sort(),
    );
    expect(await zip.file('books/Book b1__b1.epub')!.async('string')).toBe('epub-one');

    const records = await readJson(zip, 'records.json');
    expect(records.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(records.tables.vocabulary).toHaveLength(2);
    expect(records.tables.books).toHaveLength(3); // the book without a file keeps its record
    expect(records.tables['arabic-reader-personal-dictionary/dictionaries'][0]).toMatchObject({ label: 'Mine' });

    const csv = await zip.file('vocabulary.csv')!.async('string');
    expect(csv.startsWith('﻿word,meaning,root,lemma,sentence,book,added,mastery,due\r\n')).toBe(true);
    expect(csv).toContain('"a word, ""quoted""\nsecond line"');
    expect(csv).toContain("'=HYPERLINK"); // a sentence cannot run as a formula
    expect(csv).toContain('2026-01-02,learning,2026-01-09');

    const md = await zip.file('highlights.md')!.async('string');
    expect(md).toContain('## Book b1');
    expect(md).toContain('> a passage\n> over two lines');
    expect(md).toContain('**Note:** my note');
  });

  it('can leave the books out, and can be cancelled', async () => {
    await seed();
    const zip = await unzip((await buildExport({ ...exportOptions, includeBooks: false })).blob);
    expect(Object.keys(zip.files).some((f) => f.startsWith('books/'))).toBe(false);

    const abort = new AbortController();
    abort.abort();
    await expect(buildExport({ ...exportOptions, includeBooks: true, signal: abort.signal })).rejects.toBeInstanceOf(ExportCancelled);
  });
});

describe('import', () => {
  it('restores everything into an empty profile', async () => {
    await seed();
    await putSeedRecords();
    const { blob } = await buildExport({ ...exportOptions, includeBooks: true });
    const before = {
      vocabulary: (await db.vocabulary.toArray()).map(({ updatedAt: _u, ...r }) => r),
      highlights: (await db.highlights.toArray()).map(({ updatedAt: _u, ...r }) => r),
    };
    await wipe();

    const summary = await importExport(blob);
    expect(summary).toMatchObject({ booksRestored: 2, booksAlreadyHere: 0, booksWithoutRecord: 0, skipped: 0 });
    expect(summary.tables.vocabulary).toEqual({ written: 2, kept: 0, skipped: 0 });

    expect((await db.vocabulary.toArray()).map(({ updatedAt: _u, ...r }) => r)).toEqual(before.vocabulary);
    expect((await db.highlights.toArray()).map(({ updatedAt: _u, ...r }) => r)).toEqual(before.highlights);
    expect(await db.books.count()).toBe(3);
    expect(await db.bookmarks.count()).toBe(1);
    expect(await db.positions.get('b1')).toMatchObject({ percent: 0.4 });
    expect(await db.wordInstances.get('b1::كلمة')).toMatchObject({ encounterCount: 3 });
    expect(await db.sensePicks.count()).toBe(1);
    expect((await loadPersonalDictionary())?.label).toBe('Mine');
    expect(await (await persistenceService.getBookFile('b1'))!.text()).toBe('epub-one');
    expect((await persistenceService.getBookFileIds()).sort()).toEqual(['b1', 'b2']); // b3 still has no file
  });

  it('never deletes, and never replaces what is newer on this device', async () => {
    await putSeedRecords();
    const { blob } = await buildExport({ ...exportOptions, includeBooks: false });

    // After the export: v1 was edited here (newer), v2 was removed here... and a new word was added.
    await db.vocabulary.update('v1', { meaning: 'edited later', updatedAt: Date.now() + 100_000 });
    await db.vocabulary.delete('v2');
    await db.vocabulary.put(vocab('v3', { updatedAt: 1 }));
    // A highlight the export has an older copy of.
    await db.highlights.update('h1', { note: 'older here', updatedAt: 1 });

    const summary = await importExport(blob);
    expect((await db.vocabulary.get('v1'))?.meaning).toBe('edited later'); // newer here: kept
    expect(await db.vocabulary.get('v2')).toBeDefined(); // missing here: restored
    expect(await db.vocabulary.get('v3')).toBeDefined(); // only here: untouched
    expect((await db.highlights.get('h1'))?.note).toBe('my note'); // older here: replaced
    expect(summary.tables.vocabulary).toEqual({ written: 1, kept: 1, skipped: 0 });

    // Importing again changes nothing more.
    const again = await importExport(blob);
    expect(again.tables.vocabulary.written).toBeLessThanOrEqual(1); // the freshly stamped copy may be re-read as older
    expect(await db.vocabulary.count()).toBe(3);
  });

  it('keeps the dictionary and the book files that are already here', async () => {
    await seed();
    await putSeedRecords();
    const { blob } = await buildExport({ ...exportOptions, includeBooks: true });
    await savePersonalDictionary('Different', [['x', 'y'] as never]);
    const summary = await importExport(blob);
    expect(summary).toMatchObject({ booksRestored: 0, booksAlreadyHere: 2 });
    expect((await loadPersonalDictionary())?.label).toBe('Different');
  });

  it('puts imported rows through the write layer, so sync sees them', async () => {
    await putSeedRecords();
    const { blob } = await buildExport({ ...exportOptions, includeBooks: false });
    await wipe();
    await enableSyncCapture();
    await importExport(blob);
    const events = await db.syncOutbox.toArray();
    expect(events.filter((e) => e.table === 'vocabulary')).toHaveLength(2);
  });

  it('refuses a file from a newer app, and files that are not exports, before changing anything', async () => {
    const zipOf = async (files: Record<string, string>) => {
      const zip = new JSZip();
      for (const [name, text] of Object.entries(files)) zip.file(name, text);
      return zip.generateAsync({ type: 'blob' });
    };
    const newer = await zipOf({ 'records.json': JSON.stringify({ formatVersion: EXPORT_FORMAT_VERSION + 1, tables: { vocabulary: [vocab('v9')] } }) });
    await expect(importExport(newer)).rejects.toThrow('made by a newer version of Arabic Reader. Update the app and try again.');
    await expect(importExport(await zipOf({ 'other.txt': 'hi' }))).rejects.toBeInstanceOf(ExportFormatError);
    await expect(importExport(await zipOf({ 'records.json': 'not json' }))).rejects.toBeInstanceOf(ExportFormatError);
    await expect(importExport(await zipOf({ 'records.json': '[]' }))).rejects.toBeInstanceOf(ExportFormatError);
    await expect(importExport(new Blob(['plain text']))).rejects.toBeInstanceOf(ExportFormatError);
    expect(await db.vocabulary.count()).toBe(0);
  });

  it('skips unusable rows and fills defaults, as the quick backup does', async () => {
    const zip = new JSZip();
    zip.file(
      'records.json',
      JSON.stringify({
        formatVersion: 1,
        tables: {
          vocabulary: [{ id: 'ok', surfaceForm: 'كلمة', bookId: 'b1' }, { surfaceForm: 'no id' }, 'junk'],
          bookmarks: [{ id: 'm1', bookId: 'b1', updatedAt: 1 }, { nope: true }],
        },
      }),
    );
    const summary = await importExport(await zip.generateAsync({ type: 'blob' }));
    expect(summary.skipped).toBe(3);
    const row = await db.vocabulary.get('ok');
    expect(row).toMatchObject({ mastery: 'new', meaning: '' });
    expect(typeof row?.fsrsDue).toBe('number'); // review can read it
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('ignores book files with no record, and files that are not ours', async () => {
    const zip = new JSZip();
    zip.file('records.json', JSON.stringify({ formatVersion: 1, tables: {} }));
    zip.file('books/Ghost__ghost.epub', 'bytes');
    zip.file('books/notes.txt', 'not a book');
    zip.file('../escape__b1.epub', 'x');
    const summary = await importExport(await zip.generateAsync({ type: 'blob' }));
    expect(summary).toMatchObject({ booksRestored: 0, booksWithoutRecord: 1 });
    expect(await persistenceService.getBookFileIds()).toEqual([]);
  });
});

describe('file names, CSV and Markdown', () => {
  it('names book files readably and finds the id again', () => {
    expect(bookFileName('b1', 'كتاب: الأول / part*1?')).toBe('books/كتاب الأول part 1__b1.epub');
    expect(bookFileName('b2', '   ')).toBe('books/book__b2.epub');
    expect(bookFileName('b3', 'x'.repeat(200)).length).toBeLessThan(90);
    expect(bookIdFromFileName('books/Anything at all__book_ab-1.epub')).toBe('book_ab-1');
    expect(bookIdFromFileName('books/x.epub')).toBeNull();
    expect(bookIdFromFileName('other/x__b1.epub')).toBeNull();
  });

  it('escapes CSV fields and neutralises formulas', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx']) expect(csvField(bad).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvField(undefined)).toBe('');
    expect(csvField(5)).toBe('5');
    expect(vocabularyCsv([])).toBe('﻿word,meaning,root,lemma,sentence,book,added,mastery,due\r\n');
  });

  it('writes highlights per book in reading order, and says so when there are none', () => {
    expect(highlightsMarkdown([])).toContain('No highlights yet.');
    const md = highlightsMarkdown([highlight('b', { createdAt: 2, text: 'second', note: undefined }), highlight('a', { createdAt: 1, text: 'first', chapterLabel: 'Ch 1' })]);
    expect(md.indexOf('first')).toBeLessThan(md.indexOf('second'));
    expect(md).toContain('*yellow (Ch 1)*');
  });
});

describe('removing only the file', () => {
  it('keeps the book, its record and notes, and adding the same file back restores it', async () => {
    await persistenceService.saveBook(book('b1'), epub('epub-one'));
    await persistenceService.removeBookFile('b1');
    expect(await persistenceService.getBook('b1')).toBeDefined();
    expect(await persistenceService.getBookFileIds()).toEqual([]);
    expect(await persistenceService.getBookFile('b1')).toBeUndefined();
    expect((await store.usage()).book).toBeUndefined();

    await persistenceService.saveBookFile('b1', epub('epub-one'));
    expect(await (await persistenceService.getBookFile('b1'))!.text()).toBe('epub-one');
  });

  it('frees nothing while an identical book still needs the bytes', async () => {
    await persistenceService.saveBook(book('b1'), epub('same'));
    await persistenceService.saveBook(book('b2'), epub('same'));
    await persistenceService.removeBookFile('b1');
    expect((await store.usage()).book.count).toBe(1);
    expect(await (await persistenceService.getBookFile('b2'))!.text()).toBe('same');
  });

  it('removes a book file that was not moved yet', async () => {
    await db.books.put({ ...book('old'), updatedAt: 1 });
    await db.bookFiles.put({ bookId: 'old', data: epub('legacy') });
    await persistenceService.removeBookFile('old');
    expect(await db.bookFiles.count()).toBe(0);
    expect(await persistenceService.getBookFileIds()).toEqual([]);
  });
});
