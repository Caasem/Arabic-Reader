import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistenceService } from '../persistence/db';
import { db } from '../persistence/schema';
import type { DiskFileInfo } from '../sync/desktopBridge';
import { defaultOpenDeps, openToken, type OpenDeps } from './openToken';
import { addToLibrary, inPlaceHash } from './promote';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (text: string) => new TextEncoder().encode(text);

/** A fake desktop app: one file per token, found again by hash while it "exists". */
function fakeDisk(files: Record<string, { name: string; bytes: Uint8Array }>) {
  const present = new Set(Object.keys(files));
  const byHash = new Map(Object.entries(files).map(([token, f]) => [sha(f.bytes), token]));
  const bridge = {
    describe: vi.fn(async (token: string): Promise<DiskFileInfo> => {
      const f = files[token];
      return { name: f.name, size: f.bytes.length, mtime: 1, hash: sha(f.bytes), ext: f.name.split('.').pop()!.toLowerCase() };
    }),
    read: vi.fn(async (token: string) => files[token].bytes),
    readByHash: vi.fn(async (hash: string) => {
      const token = byHash.get(hash);
      return token && present.has(token) ? files[token].bytes : null;
    }),
  };
  return { bridge, remove: (token: string) => present.delete(token) };
}

function deps(bridge: OpenDeps['files']): OpenDeps {
  return {
    files: bridge,
    pdfInfo: vi.fn(async () => ({ pages: 12, title: 'A Real Title', author: 'An Author' })),
    epubInfo: vi.fn(async () => ({ title: 'An EPUB', author: 'Writer', language: 'ar', coverDataUrl: 'data:image/png;base64,AA' })),
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(() => vi.unstubAllGlobals());

describe('openToken', () => {
  it('makes an in-place PDF book with no copy of the file', async () => {
    const disk = fakeDisk({ t1: { name: 'notes.pdf', bytes: bytesOf('%PDF one') } });
    const book = await openToken('t1', deps(disk.bridge));
    expect(book).toMatchObject({
      title: 'A Real Title',
      author: 'An Author',
      format: 'pdf',
      inPlace: true,
      originalFileName: 'notes.pdf',
      pdf: { pages: 12, reflow: 'skipped', originalHash: sha(bytesOf('%PDF one')) },
    });
    expect(book.fileHash).toBeUndefined();
    expect(await persistenceService.getBook(book.id)).toMatchObject({ id: book.id, inPlace: true });
    expect(await persistenceService.getBookFileIds()).toEqual([]);
  });

  it('falls back to the file name when the PDF has no real title', async () => {
    const disk = fakeDisk({ t1: { name: 'chapter three.pdf', bytes: bytesOf('%PDF two') } });
    const d = deps(disk.bridge);
    d.pdfInfo = vi.fn(async () => ({ pages: 3 }));
    expect((await openToken('t1', d)).title).toBe('chapter three');
  });

  it('opens the same file again as the same book, even from another place', async () => {
    const disk = fakeDisk({
      t1: { name: 'a.pdf', bytes: bytesOf('%PDF same') },
      t2: { name: 'copy of a.pdf', bytes: bytesOf('%PDF same') },
    });
    const first = await openToken('t1', deps(disk.bridge));
    const second = await openToken('t2', deps(disk.bridge));
    expect(second.id).toBe(first.id);
    expect(await persistenceService.getBooks()).toHaveLength(1);
  });

  it('finds a library book made from the same PDF by its original hash', async () => {
    const bytes = bytesOf('%PDF library');
    await persistenceService.saveBook({ id: 'lib', title: 'In library', format: 'pdf', addedAt: 1, sizeBytes: 1, pdf: { pages: 2, reflow: 'ok', originalHash: sha(bytes) } }, new Blob(['epub']));
    const disk = fakeDisk({ t1: { name: 'x.pdf', bytes } });
    expect((await openToken('t1', deps(disk.bridge))).id).toBe('lib');
  });

  it('makes an in-place EPUB book that keeps the file hash, and finds it again by that hash', async () => {
    const disk = fakeDisk({ t1: { name: 'book.epub', bytes: bytesOf('PK epub') } });
    const d = deps(disk.bridge);
    const book = await openToken('t1', d);
    expect(book).toMatchObject({ title: 'An EPUB', author: 'Writer', language: 'ar', format: 'epub', inPlace: true, fileHash: sha(bytesOf('PK epub')) });
    expect((await openToken('t1', d)).id).toBe(book.id);
    expect(d.epubInfo).toHaveBeenCalledTimes(1);
  });

  it('refuses a format that needs converting, and explains an unreadable PDF', async () => {
    const disk = fakeDisk({ t1: { name: 'x.mobi', bytes: bytesOf('m') }, t2: { name: 'bad.pdf', bytes: bytesOf('nope') } });
    await expect(openToken('t1', deps(disk.bridge))).rejects.toThrow(/Add it to the library/);
    const d = deps(disk.bridge);
    d.pdfInfo = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(openToken('t2', d)).rejects.toThrow('This PDF could not be opened.');
    expect(await persistenceService.getBooks()).toEqual([]);
  });

  it('exposes the default dependencies without loading them', () => {
    const disk = fakeDisk({});
    expect(Object.keys(defaultOpenDeps(disk.bridge)).sort()).toEqual(['epubInfo', 'files', 'pdfInfo']);
  });
});

describe('bytes of a book opened in place', () => {
  it('come from the file on disk, and the book is missing its file once that is gone', async () => {
    const bytes = bytesOf('%PDF reader');
    const disk = fakeDisk({ t1: { name: 'r.pdf', bytes } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    const book = await openToken('t1', deps(disk.bridge));

    expect(await (await persistenceService.getPdfOriginal(book.id))?.arrayBuffer()).toEqual(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    disk.remove('t1');
    expect(await persistenceService.getPdfOriginal(book.id)).toBeUndefined();
  });

  it('are not read from disk for a book that is not in place', async () => {
    const bytes = bytesOf('%PDF other');
    const disk = fakeDisk({ t1: { name: 'o.pdf', bytes } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    await persistenceService.saveBook({ id: 'plain', title: 'p', format: 'pdf', addedAt: 1, sizeBytes: 1, pdf: { pages: 1, reflow: 'ok', originalHash: sha(bytes) } }, new Blob(['e']));
    expect(await persistenceService.getPdfOriginal('plain')).toBeUndefined();
    expect(disk.bridge.readByHash).not.toHaveBeenCalled();
  });

  it('reads an in-place EPUB from disk', async () => {
    const bytes = bytesOf('PK the epub');
    const disk = fakeDisk({ t1: { name: 'e.epub', bytes } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    const book = await openToken('t1', deps(disk.bridge));
    expect(await (await persistenceService.getBookFile(book.id))?.text()).toBe('PK the epub');
  });
});

describe('add to library', () => {
  it('copies a PDF in, keeps the record and its pages-only mode, and clears the mark', async () => {
    const bytes = bytesOf('%PDF to keep');
    const disk = fakeDisk({ t1: { name: 'k.pdf', bytes } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    const book = await openToken('t1', deps(disk.bridge));
    await addToLibrary(book);

    const after = await persistenceService.getBook(book.id);
    expect(after?.inPlace).toBeUndefined();
    expect(after?.pdf).toEqual({ pages: 12, reflow: 'skipped', originalHash: sha(bytes) });
    // The copy is in the library's own storage now: it reads with the file gone.
    disk.remove('t1');
    expect((await persistenceService.getPdfOriginal(book.id))?.size).toBe(bytes.length);
  });

  it('copies an EPUB in under its file hash', async () => {
    const bytes = bytesOf('PK epub to keep');
    const disk = fakeDisk({ t1: { name: 'k.epub', bytes } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    const book = await openToken('t1', deps(disk.bridge));
    await addToLibrary(book);
    disk.remove('t1');
    expect(await persistenceService.getBookFileIds()).toEqual([book.id]);
    expect((await persistenceService.getBook(book.id))?.inPlace).toBeUndefined();
    expect(inPlaceHash((await persistenceService.getBook(book.id))!)).toBe(sha(bytes));
  });

  it('says so when the file has gone', async () => {
    const disk = fakeDisk({ t1: { name: 'g.pdf', bytes: bytesOf('%PDF gone') } });
    vi.stubGlobal('window', { arabicReaderDesktop: { files: disk.bridge } });
    const book = await openToken('t1', deps(disk.bridge));
    disk.remove('t1');
    await expect(addToLibrary(book)).rejects.toThrow(/isn't where it was/);
    expect((await persistenceService.getBook(book.id))?.inPlace).toBe(true);
  });
});
