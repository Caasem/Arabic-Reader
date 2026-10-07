import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSigningKey } from './manifest';
// Plain Node script code, outside src/ and untyped: load it and say what it exports.
// @ts-expect-error no declaration file for a .mjs script
import * as libModule from '../../scripts/packs/lib.mjs';

interface Lib {
  buildRepository(o: { packsRoot: string; out: string; privateKeyJwk: JsonWebKey; minAppVersion: string; now?: Date }): Promise<{ sequence: number; packs: { id: string; version: number; files: { name: string; hash: string }[] }[] }>;
  verifyRepository(o: { dir: string; trustedKeys: string[] }): Promise<string[]>;
}
const lib = libModule as unknown as Lib;

const ROOT = path.resolve(__dirname, '..', '..');
let work: string;
let packs: string;
let out: string;

const definition = (over: Record<string, unknown> = {}) => ({
  id: 'demo',
  version: 1,
  title: 'Demo dictionary',
  kind: 'dictionary',
  licence: { spdx: 'CC0-1.0', source: 'https://example.org', attribution: 'Nobody' },
  ...over,
});

function writePack(folder: string, files: Record<string, string>, over: Record<string, unknown> = {}): void {
  const dir = path.join(packs, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(definition(over)));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
}

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'ar-packs-'));
  packs = path.join(work, 'packs');
  out = path.join(work, 'out');
  mkdirSync(out);
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const build = async (keys: Awaited<ReturnType<typeof generateSigningKey>>) =>
  lib.buildRepository({ packsRoot: packs, out, privateKeyJwk: keys.privateKeyJwk, minAppVersion: '0.36.0' });

describe('building a pack repository', () => {
  it('writes hash-named files and a signed manifest that verifies', async () => {
    writePack('demo', { 'index.json': '{"a":1}', 'data/entries.json': '[1,2,3]' });
    writePack('other', { 'words.txt': 'كتاب' }, { id: 'other', kind: 'frequency' });
    const keys = await generateSigningKey();
    const manifest = await build(keys);

    expect(manifest.sequence).toBe(1);
    expect(manifest.packs.map((p) => p.id)).toEqual(['demo', 'other']);
    const hashes = manifest.packs.flatMap((p) => p.files.map((f) => f.hash));
    expect(readdirSync(path.join(out, 'p')).sort()).toEqual([...hashes].sort());
    expect(await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] })).toEqual([]);
    // The manifest on disk is the one that was signed.
    expect(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')).signature).toBeTruthy();
  });

  it('stores identical files once', async () => {
    writePack('a', { 'x.json': 'same' }, { id: 'a' });
    writePack('b', { 'y.json': 'same' }, { id: 'b' });
    await build(await generateSigningKey());
    expect(readdirSync(path.join(out, 'p'))).toHaveLength(1);
  });

  it('raises the sequence on each build and accepts new versions', async () => {
    const keys = await generateSigningKey();
    writePack('demo', { 'i.json': 'one' });
    expect((await build(keys)).sequence).toBe(1);
    expect((await build(keys)).sequence).toBe(2); // unchanged files: allowed
    writePack('demo', { 'i.json': 'two' }, { version: 2 });
    rmSync(path.join(packs, 'demo', 'i.json'));
    writeFileSync(path.join(packs, 'demo', 'j.json'), 'two');
    const third = await build(keys);
    expect(third.sequence).toBe(3);
    expect(third.packs[0].version).toBe(2);
  });

  it('refuses a published version with different files, and an older version', async () => {
    const keys = await generateSigningKey();
    writePack('demo', { 'i.json': 'one' }, { version: 2 });
    await build(keys);
    writeFileSync(path.join(packs, 'demo', 'i.json'), 'changed');
    await expect(build(keys)).rejects.toThrow(/already published with different files/);
    writePack('demo', { 'i.json': 'one' }, { version: 1 });
    await expect(build(keys)).rejects.toThrow(/older than the published 2/);
    // Nothing was published by the failed builds.
    expect(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')).sequence).toBe(1);
  });

  it('refuses a pack with no recorded licence, writing nothing', async () => {
    writePack('demo', { 'i.json': 'one' }, { licence: { spdx: '', source: '', attribution: '' } });
    await expect(build(await generateSigningKey())).rejects.toThrow(/licence/);
    expect(readdirSync(out)).toEqual([]);
  });

  it('refuses a folder with no pack.json or no packs at all', async () => {
    mkdirSync(path.join(packs, 'empty'), { recursive: true });
    await expect(build(await generateSigningKey())).rejects.toThrow(/pack.json is missing/);
    rmSync(packs, { recursive: true });
    mkdirSync(packs);
    await expect(build(await generateSigningKey())).rejects.toThrow(/No packs found/);
  });
});

describe('verifying a pack repository', () => {
  async function built() {
    writePack('demo', { 'index.json': '{"a":1}', 'entries.json': '[1,2,3]' });
    const keys = await generateSigningKey();
    const manifest = await build(keys);
    const file = (name: string) => path.join(out, 'p', manifest.packs[0].files.find((f) => f.name === name)!.hash);
    return { keys, file };
  }

  it('catches a file changed to the same length, a truncated file and a missing file', async () => {
    const { keys, file } = await built();
    writeFileSync(file('index.json'), '{"a":2}'); // same size, different bytes
    truncateSync(file('entries.json'), 3);
    const problems = await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] });
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('demo index.json: contents do not match'), expect.stringContaining('demo entries.json: is 3 bytes')]));

    rmSync(file('index.json'));
    expect(await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] })).toEqual(expect.arrayContaining([expect.stringContaining('demo index.json: missing')]));
  });

  it('catches an appended file, a changed manifest and a wrong key', async () => {
    const { keys, file } = await built();
    appendFileSync(file('entries.json'), 'x');
    expect((await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] })).join('\n')).toMatch(/entries.json: is 8 bytes, the manifest says 7/);

    const manifestPath = path.join(out, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.minAppVersion = '0.0.1';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] })).toEqual(['manifest: the signature is not from a trusted key']);
    expect(await lib.verifyRepository({ dir: out, trustedKeys: [(await generateSigningKey()).publicKey] })).toEqual(['manifest: the signature is not from a trusted key']);
    rmSync(manifestPath);
    expect(await lib.verifyRepository({ dir: out, trustedKeys: [keys.publicKey] })).toEqual(['manifest.json is missing or is not JSON']);
  });
});

describe('the command line', () => {
  const node = (script: string, ...args: string[]) =>
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'packs', script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const fails = (script: string, ...args: string[]): string => {
    try {
      node(script, ...args);
    } catch (error) {
      return String((error as { stderr?: string }).stderr);
    }
    throw new Error('expected the command to fail');
  };

  it('makes a key, builds, verifies, and rejects a tampered file', () => {
    writePack('demo', { 'index.json': '{"a":1}' });
    const keyFile = path.join(work, 'signing.jwk');
    const publicKey = node('gen-key.mjs', keyFile).split('\n').filter(Boolean).pop()!;
    expect(publicKey).toHaveLength(87);

    const built = node('build.mjs', packs, out, '--key-file', keyFile);
    expect(built).toContain('Manifest #1: demo v1');
    expect(node('verify.mjs', out, '--public-key', publicKey)).toContain('verify');

    const [hash] = readdirSync(path.join(out, 'p'));
    writeFileSync(path.join(out, 'p', hash), '{"a":9}');
    expect(fails('verify.mjs', out, '--public-key', publicKey)).toContain('contents do not match');
  });

  it('refuses to write a key into the repository, or to overwrite one, or to sign with one inside it', () => {
    expect(fails('gen-key.mjs', path.join(ROOT, 'oops.jwk'))).toContain('inside the repository');
    const keyFile = path.join(work, 'signing.jwk');
    node('gen-key.mjs', keyFile);
    expect(fails('gen-key.mjs', keyFile)).toContain('already exists');
    writePack('demo', { 'index.json': '{}' });
    expect(fails('build.mjs', packs, out, '--key-file', path.join(ROOT, 'package.json'))).toContain('inside the repository');
    expect(fails('build.mjs', packs, out)).toContain('No signing key');
  });
});
