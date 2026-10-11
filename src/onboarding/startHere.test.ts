// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBlobStoreForTests } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { libraryService } from '../library/libraryService';
import { db } from '../persistence/schema';
import { parseCleanEpub } from '../readerCore/parseCleanEpub';
import { ITEMS } from '../gettingStarted/items';
import { START_HERE_BOOK_ID } from './firstRun';

const bytes = readFileSync('public/start-here.epub');
const file = () => new File([new Uint8Array(bytes)], 'start-here.epub', { type: 'application/epub+zip' });

describe('public/start-here.epub', () => {
  it('is a valid EPUB package: mimetype first and stored, container, OPF, nav', async () => {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    expect(await zip.file('META-INF/container.xml')!.async('string')).toContain('OEBPS/content.opf');
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:language>ar</dc:language>');
    expect(opf).toContain('<dc:title>ابدأ من هنا — Start here</dc:title>');
    expect(opf).toContain('<dc:creator>Arabic Reader</dc:creator>');
    expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('epub:type="toc"');
  });

  it('reads as five chapters whose tasks are numbered in checklist order', async () => {
    const book = await parseCleanEpub(new Blob([new Uint8Array(bytes)]));
    expect(book.chapters).toHaveLength(5);
    const text = book.chapters.flatMap((c) => c.blocks.map((b) => ('s' in b ? b.s : ''))).join('\n');
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const numbers = [...text.matchAll(/^مُهِمَّة ([٠-٩]) · ⁦Task (\d):/gm)].map((m) => {
      expect(arabicDigits.indexOf(m[1])).toBe(Number(m[2]));
      return Number(m[2]);
    });
    expect(numbers).toEqual(ITEMS.map((_, i) => i + 1));
    for (const c of book.chapters) {
      const sentences = c.blocks.filter((b) => b.t === 'p' && !/^(مُهِمَّة|مُلاحَظَة)/.test(b.s));
      expect(sentences.length).toBeGreaterThanOrEqual(6);
      expect(sentences.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('importing it as the starter book', () => {
  let blobDb: BlobDB;
  beforeEach(async () => {
    await db.open();
    blobDb = new BlobDB('start-here-test');
    setBlobStoreForTests(createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex }));
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  afterEach(async () => {
    setBlobStoreForTests(null);
    await blobDb.delete();
  });

  it('lands on the shelf under the fixed id, titled and in Arabic', async () => {
    const book = await libraryService.importEpub(file(), { id: START_HERE_BOOK_ID });
    expect(book.id).toBe('starter-start-here');
    expect(book.title).toBe('ابدأ من هنا — Start here');
    expect(book.language).toBe('ar');
  });
});
