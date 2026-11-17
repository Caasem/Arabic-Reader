import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Found = { path: string; name: string; format: string; size: number; mtime: number };
type Progress = { checked: number; found: number; done: boolean; added: Found[] };
const { createBookScan, withoutNested, skipFolder } = createRequire(import.meta.url)('../../electron/bookScan.cjs') as {
  createBookScan(o: { userDataDir: string; getRoots: () => string[]; progressMs?: number }): {
    state(): Promise<{ roots: string[]; extraFolders: string[]; results: Found[]; scannedAt: number | null; running: boolean }>;
    start(o?: { extra?: string[]; onProgress?: (p: Progress) => void }): Promise<{ checked: number; found: number; cancelled: boolean }>;
    stop(): void;
    addFolder(folder: string): Promise<string[]>;
    removeFolder(folder: string): Promise<string[]>;
    isResult(file: string): Promise<boolean>;
    resultOf(file: string): Promise<Found | null>;
  };
  withoutNested(folders: string[]): string[];
  skipFolder(name: string): boolean;
};

let dir: string;
let home: string;
let userData: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ar-scan-'));
  home = path.join(dir, 'home');
  userData = path.join(dir, 'userData');
  mkdirSync(home);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function put(rel: string, size = 10) {
  const full = path.join(home, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, 'x'.repeat(size));
  return full;
}

const names = (results: Found[]) => results.map((r) => path.relative(home, r.path).split(path.sep).join('/')).sort();
const scanner = (roots = [home], progressMs = 0) => createBookScan({ userDataDir: userData, getRoots: () => roots, progressMs });

describe('book scan', () => {
  it('finds the book formats and only those', async () => {
    for (const name of ['a.pdf', 'b.EPUB', 'c.mobi', 'd.azw3', 'notes.docx', 'photo.jpg', 'sub/e.pdf']) put(name);
    put('big.txt', 5000);
    put('big.md', 2000);
    const scan = scanner();
    const summary = await scan.start();
    const state = await scan.state();
    expect(names(state.results)).toEqual(['a.pdf', 'b.EPUB', 'big.md', 'big.txt', 'c.mobi', 'd.azw3', 'sub/e.pdf']);
    expect(summary).toMatchObject({ found: 7, cancelled: false });
    // Everything that is a file counts as checked.
    expect(summary.checked).toBe(9);
    expect(state.results.find((r) => r.name === 'b.EPUB')).toMatchObject({ format: 'epub', size: 10 });
  });

  it('leaves out TXT and Markdown of 1 KB or less', async () => {
    put('tiny.txt', 100);
    put('edge.md', 1024);
    put('over.txt', 1025);
    const scan = scanner();
    await scan.start();
    expect(names((await scan.state()).results)).toEqual(['over.txt']);
  });

  it('skips hidden, system and app folders', () => {
    for (const name of ['.hidden', '.git', 'node_modules', 'AppData', 'appdata', 'Windows', 'Program Files', '$RECYCLE.BIN', 'Safari.app']) expect(skipFolder(name), name).toBe(true);
    for (const name of ['Books', 'Telegram Desktop', 'app', 'Apple']) expect(skipFolder(name), name).toBe(false);
  });

  it('does not go into skipped folders', async () => {
    put('Books/ok.pdf');
    for (const folder of ['.hidden', 'node_modules', 'AppData', 'Thing.app']) put(`${folder}/no.pdf`);
    const scan = scanner();
    await scan.start();
    expect(names((await scan.state()).results)).toEqual(['Books/ok.pdf']);
  });

  it('goes 12 folders deep and no deeper', async () => {
    let rel = '';
    for (let depth = 0; depth <= 14; depth++) {
      put(path.join(rel, `at-${depth}.pdf`));
      rel = path.join(rel, `d${depth}`);
    }
    const scan = scanner();
    await scan.start();
    const found = names((await scan.state()).results).map((n) => n.split('/').pop());
    expect(found.sort()).toEqual(Array.from({ length: 13 }, (_, i) => `at-${i}.pdf`).sort());
  });

  it('can be stopped, and keeps what it had found', async () => {
    for (let i = 0; i < 30; i++) put(`f${i}.pdf`);
    const scan = scanner();
    const summary = await scan.start({
      onProgress(p) {
        if (!p.done) scan.stop();
      },
    });
    expect(summary.cancelled).toBe(true);
    expect(summary.found).toBeLessThan(30);
    expect(summary.found).toBeGreaterThan(0);
    expect((await scan.state()).results).toHaveLength(summary.found);
  });

  it('reports progress, each book once, and a last message when done', async () => {
    for (let i = 0; i < 5; i++) put(`b${i}.pdf`);
    put('other.txt', 3);
    const scan = scanner();
    const seen: Progress[] = [];
    await scan.start({ onProgress: (p) => seen.push(p) });
    expect(seen.at(-1)).toMatchObject({ done: true, found: 5, checked: 6 });
    expect(seen.slice(0, -1).every((p) => !p.done)).toBe(true);
    expect(seen.flatMap((p) => p.added)).toHaveLength(5);
  });

  it('looks in folders the reader adds, and not in ones it removed', async () => {
    const other = path.join(dir, 'other');
    mkdirSync(other);
    writeFileSync(path.join(other, 'extra.pdf'), 'x');
    put('home.pdf');
    const scan = scanner();
    expect(await scan.addFolder(other)).toEqual([other]);
    await scan.start();
    expect((await scan.state()).results.map((r) => r.name).sort()).toEqual(['extra.pdf', 'home.pdf']);
    expect(await scan.removeFolder(other)).toEqual([]);
    await scan.start();
    expect((await scan.state()).results.map((r) => r.name)).toEqual(['home.pdf']);
  });

  it('ignores a folder that was not added, even if the caller asks for it', async () => {
    const other = path.join(dir, 'sneaky');
    mkdirSync(other);
    writeFileSync(path.join(other, 'secret.pdf'), 'x');
    const scan = scanner();
    await scan.start({ extra: [other] });
    expect((await scan.state()).results).toEqual([]);
  });

  it('skips roots that are missing, and folders inside another root', async () => {
    put('a.pdf');
    const scan = scanner([home, path.join(dir, 'nowhere'), path.join(home, 'Telegram Desktop')]);
    put('Telegram Desktop/t.pdf');
    await scan.start();
    const state = await scan.state();
    expect(state.roots).toEqual([home]);
    expect(names(state.results)).toEqual(['Telegram Desktop/t.pdf', 'a.pdf']);
    expect(withoutNested(['/a/b', '/a', '/c'])).toEqual(['/a', '/c'].map((p) => path.resolve(p)));
  });

  it('keeps results until the next scan, across restarts, and allows only found paths', async () => {
    const found = put('keep.pdf');
    const first = scanner();
    await first.start();
    const second = scanner();
    expect(names((await second.state()).results)).toEqual(['keep.pdf']);
    expect((await second.state()).scannedAt).toBeTypeOf('number');
    expect(await second.isResult(found)).toBe(true);
    expect((await second.resultOf(found))?.name).toBe('keep.pdf');
    const unlisted = put('later.pdf');
    expect(await second.isResult(unlisted)).toBe(false);
    expect(await second.isResult(path.join(dir, 'userData', 'scan.json'))).toBe(false);
    expect(await second.resultOf('../etc/passwd')).toBeNull();
  });
});
