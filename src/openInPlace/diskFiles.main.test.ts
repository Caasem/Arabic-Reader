import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The Electron main-process modules are plain CommonJS outside src/, so load them the way Node does.
const req = createRequire(import.meta.url);
const { createDiskFiles } = req('../../electron/diskFiles.cjs') as {
  createDiskFiles(o: { userDataDir: string }): {
    register(file: string): string;
    pathOfToken(token: string): string | null;
    describe(token: string): Promise<{ name: string; size: number; mtime: number; hash: string; ext: string }>;
    read(token: string): Promise<Uint8Array>;
    readByHash(hash: string): Promise<Uint8Array | null>;
    has(hash: string): Promise<boolean>;
    locate(hash: string, file: string): Promise<boolean>;
    knownPaths(): Promise<string[]>;
    knownFiles(): Promise<{ path: string; hash: string }[]>;
    readAndRecord(file: string): Promise<Uint8Array>;
  };
};
const { pickOpenablePaths, isInPlaceExt } = req('../../electron/fileArgs.cjs') as {
  pickOpenablePaths(argv: string[], o?: { cwd?: string; appPath?: string }): string[];
  isInPlaceExt(file: string): boolean;
};
const { createWindowRegistry } = req('../../electron/windowRegistry.cjs') as {
  createWindowRegistry(): {
    list(): { id: number; kind: string; bookId: string | null; title: string }[];
    add(id: number, kind: 'main' | 'light', title: string): void;
    remove(id: number): void;
    setBook(id: number, bookId: string | null, title?: string): void;
    findByBook(bookId: string, exceptId?: number): { id: number } | null;
    mainId(): number | null;
    lightCount(): number;
    onChange(cb: (list: unknown[]) => void): () => void;
  };
};

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

let dir: string;
let userData: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ar-disk-'));
  userData = path.join(dir, 'userData');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, text: string): string {
  const full = path.join(dir, name);
  writeFileSync(full, text);
  return full;
}

describe('diskFiles', () => {
  it('describes a file by token, with its SHA-256', async () => {
    const disk = createDiskFiles({ userDataDir: userData });
    const token = disk.register(file('a.pdf', 'hello'));
    const info = await disk.describe(token);
    expect(info).toMatchObject({ name: 'a.pdf', size: 5, ext: 'pdf', hash: sha('hello') });
    expect(Array.from(await disk.read(token))).toEqual(Array.from(Buffer.from('hello')));
  });

  it('gives one token per path and refuses unknown tokens', async () => {
    const disk = createDiskFiles({ userDataDir: userData });
    const full = file('a.pdf', 'x');
    expect(disk.register(full)).toBe(disk.register(full));
    await expect(disk.describe('nope')).rejects.toThrow();
    await expect(disk.read('nope')).rejects.toThrow();
  });

  it('reads by hash after a describe, and survives a restart', async () => {
    const full = file('a.pdf', 'hello');
    const first = createDiskFiles({ userDataDir: userData });
    const { hash } = await first.describe(first.register(full));
    expect(await first.has(hash)).toBe(true);
    const second = createDiskFiles({ userDataDir: userData });
    expect(await second.has(hash)).toBe(true);
    expect(Buffer.from((await second.readByHash(hash))!).toString()).toBe('hello');
    expect(await second.knownPaths()).toEqual([path.resolve(full)]);
  });

  it('knows nothing of a hash it has not seen, or a malformed one', async () => {
    const disk = createDiskFiles({ userDataDir: userData });
    expect(await disk.readByHash(sha('x'))).toBeNull();
    expect(await disk.has(sha('x'))).toBe(false);
    expect(await disk.readByHash('../../etc/passwd')).toBeNull();
    expect(await disk.has('abc')).toBe(false);
  });

  it('says the file is gone when it is removed or changed', async () => {
    const full = file('a.pdf', 'hello');
    const disk = createDiskFiles({ userDataDir: userData });
    const { hash } = await disk.describe(disk.register(full));
    utimesSync(full, new Date(), new Date(Date.now() + 60_000));
    expect(await disk.has(hash)).toBe(false);
    expect(await disk.readByHash(hash)).toBeNull();
    rmSync(full);
    expect(await disk.has(hash)).toBe(false);
  });

  it('locates a moved file only when its bytes match', async () => {
    const disk = createDiskFiles({ userDataDir: userData });
    const { hash } = await disk.describe(disk.register(file('a.pdf', 'hello')));
    rmSync(path.join(dir, 'a.pdf'));
    expect(await disk.has(hash)).toBe(false);
    expect(await disk.locate(hash, file('other.pdf', 'different'))).toBe(false);
    expect(await disk.has(hash)).toBe(false);
    expect(await disk.locate(hash, file('moved.pdf', 'hello'))).toBe(true);
    expect(await disk.has(hash)).toBe(true);
    expect(await disk.knownPaths()).toEqual([path.join(dir, 'moved.pdf')]);
  });

  it('reads a scan result and remembers where it was, by the hash of what it read', async () => {
    const full = file('found.pdf', 'scanned');
    const disk = createDiskFiles({ userDataDir: userData });
    expect(Buffer.from(await disk.readAndRecord(full)).toString()).toBe('scanned');
    expect(await disk.knownFiles()).toEqual([{ path: path.resolve(full), hash: sha('scanned') }]);
    expect(await disk.has(sha('scanned'))).toBe(true);
    await expect(disk.readAndRecord(dir)).rejects.toThrow();
  });

  it('does not hash an unchanged file twice', async () => {
    const full = file('a.pdf', 'hello');
    const disk = createDiskFiles({ userDataDir: userData });
    const token = disk.register(full);
    const a = await disk.describe(token);
    // Same size and date, different bytes: the cache is keyed by path + size + date, so it trusts them.
    const { mtime } = a;
    writeFileSync(full, 'jello');
    utimesSync(full, new Date(mtime), new Date(mtime));
    expect((await disk.describe(token)).hash).toBe(a.hash);
  });
});

describe('pickOpenablePaths', () => {
  it('keeps existing book files and skips flags, the app path and missing files', () => {
    const pdf = file('a.pdf', 'x');
    const epub = file('b.EPUB', 'x');
    const mobi = file('c.mobi', 'x');
    const doc = file('d.docx', 'x');
    const argv = ['C:\\app\\Arabic Reader.exe', '--user-data-dir=' + dir, '--flag', '.', pdf, epub, mobi, doc, path.join(dir, 'missing.pdf'), pdf];
    expect(pickOpenablePaths(argv, { appPath: 'C:\\app\\Arabic Reader.exe' })).toEqual([pdf, epub, mobi]);
  });

  it('resolves relative names against the given folder, and skips a folder named like a book', () => {
    const pdf = file('a.pdf', 'x');
    expect(pickOpenablePaths(['a.pdf'], { cwd: dir })).toEqual([pdf]);
    expect(pickOpenablePaths([dir], { cwd: dir })).toEqual([]);
  });

  it('tells in-place formats from import formats', () => {
    expect(isInPlaceExt('x.PDF')).toBe(true);
    expect(isInPlaceExt('x.epub')).toBe(true);
    expect(isInPlaceExt('x.mobi')).toBe(false);
    expect(isInPlaceExt('x.txt')).toBe(false);
  });
});

describe('windowRegistry', () => {
  it('lists windows, tracks their books and tells listeners', () => {
    const reg = createWindowRegistry();
    const seen: number[] = [];
    const off = reg.onChange((list) => seen.push(list.length));
    reg.add(1, 'main', 'Arabic Reader');
    reg.add(2, 'light', 'a.pdf');
    reg.setBook(2, 'book-1', 'A Book');
    expect(reg.list()[1]).toMatchObject({ id: 2, bookId: 'book-1', title: 'A Book' });
    expect(reg.mainId()).toBe(1);
    expect(reg.lightCount()).toBe(1);
    expect(reg.findByBook('book-1')?.id).toBe(2);
    expect(reg.findByBook('book-1', 2)).toBeNull();
    reg.remove(2);
    off();
    reg.remove(1);
    expect(seen).toEqual([1, 2, 2, 1]);
  });
});
