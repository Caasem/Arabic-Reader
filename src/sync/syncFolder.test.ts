import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The Electron main-process module is plain CommonJS outside src/, so load it the way Node does.
const { createSyncFolder, isValidRelativePath } = createRequire(import.meta.url)('../../electron/syncFolder.cjs') as {
  createSyncFolder(o: { getRoot: () => string | null }): {
    list(): Promise<string[]>;
    read(rel: string): Promise<string>;
    write(rel: string, text: string): Promise<void>;
    remove(rel: string): Promise<void>;
  };
  isValidRelativePath(rel: unknown): boolean;
};

let root: string;
let folder: ReturnType<typeof createSyncFolder>;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ar-sync-'));
  folder = createSyncFolder({ getRoot: () => root });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('isValidRelativePath', () => {
  it('accepts <device>/<file>.json and nothing else', () => {
    expect(isValidRelativePath('3f2a-b1/batch-1-2-abc.json')).toBe(true);
    for (const bad of [
      '../x.json',
      'a/../b.json',
      '../../etc/passwd.json',
      '/abs/x.json',
      'C:/x/y.json',
      'a\\b.json',
      'a/b.txt',
      'a/b/c.json',
      'a.json',
      '.hidden/x.json',
      'a/.tmp-1.json',
      '',
      42,
      null,
    ]) {
      expect(isValidRelativePath(bad), String(bad)).toBe(false);
    }
  });
});

describe('createSyncFolder', () => {
  it('writes a new file, lists it, reads it back and removes it', async () => {
    await folder.write('dev1/batch-1-1-x.json', '{"a":"كتاب"}');
    expect(await folder.list()).toEqual(['dev1/batch-1-1-x.json']);
    expect(await folder.read('dev1/batch-1-1-x.json')).toBe('{"a":"كتاب"}');
    await folder.remove('dev1/batch-1-1-x.json');
    expect(await folder.list()).toEqual([]);
  });

  it('refuses to overwrite: files are immutable', async () => {
    await folder.write('dev1/a.json', '1');
    await expect(folder.write('dev1/a.json', '2')).rejects.toThrow(/already exists/);
    expect(await folder.read('dev1/a.json')).toBe('1');
  });

  it('leaves no temporary file behind, and never lists one', async () => {
    await folder.write('dev1/a.json', '1');
    expect(readdirSync(path.join(root, 'dev1'))).toEqual(['a.json']);
    writeFileSync(path.join(root, 'dev1', '.tmp-half'), 'partial');
    writeFileSync(path.join(root, 'dev1', 'notes.txt'), 'x');
    mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, '.git', 'x.json'), '{}');
    writeFileSync(path.join(root, 'top-level.json'), '{}');
    expect(await folder.list()).toEqual(['dev1/a.json']);
  });

  it('rejects paths that try to leave the folder, without touching anything outside', async () => {
    const outside = path.join(path.dirname(root), 'outside.json');
    for (const bad of ['../outside.json', 'a/../../outside.json', '/etc/x.json']) {
      await expect(folder.write(bad, 'x')).rejects.toThrow(/Invalid/);
      await expect(folder.read(bad)).rejects.toThrow(/Invalid/);
      await expect(folder.remove(bad)).rejects.toThrow(/Invalid/);
    }
    expect(() => readdirSync(outside)).toThrow();
  });

  it('fails clearly when no folder has been chosen', async () => {
    const none = createSyncFolder({ getRoot: () => null });
    await expect(none.list()).rejects.toThrow(/No sync folder/);
    await expect(none.write('a/b.json', 'x')).rejects.toThrow(/No sync folder/);
  });
});
