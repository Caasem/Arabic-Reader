import 'fake-indexeddb/auto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobStore } from '../blobStore';
import { createBlobStore } from '../blobStore/blobStore';
import { BlobDB } from '../blobStore/db';
import { createIdbBackend } from '../blobStore/idbBackend';
import { ArabicReaderDB } from '../persistence/schema';
import { generateSigningKey, importPrivateKey, signManifest, type Manifest } from './manifest';
import { createPackManager, type PackManager } from './packManager';
import { PackError } from './types';
// Plain Node script code, outside src/ and untyped (the same code builds the real repository).
// @ts-expect-error no declaration file for a .mjs script
import * as libModule from '../../scripts/packs/lib.mjs';

const lib = libModule as unknown as {
  buildRepository(o: { packsRoot: string; out: string; privateKeyJwk: JsonWebKey; minAppVersion: string }): Promise<Manifest>;
};

/** A static host with the faults a real one can have. */
interface Host {
  url: string;
  requests: { url: string; range?: string; headers: http.IncomingHttpHeaders }[];
  /** Replaces a file's bytes on the wire (same length unless the test says otherwise). */
  tamper: Map<string, Buffer>;
  /** Called for each file request; return 'drop' to cut the connection mid-body. */
  fault?: (req: { url: string; range?: string; nth: number }) => 'drop' | 'ignore-range' | undefined;
  manifestOverride?: string;
  down: boolean;
  close(): Promise<void>;
}

async function startHost(dir: string): Promise<Host> {
  let fileRequests = 0;
  const host: Host = {
    url: '',
    requests: [],
    tamper: new Map(),
    down: false,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    host.requests.push({ url, range: req.headers.range, headers: req.headers });
    if (host.down) return void req.socket.destroy();
    if (url === '/manifest.json') {
      res.setHeader('content-type', 'application/json');
      return void res.end(host.manifestOverride ?? readFileSync(path.join(dir, 'manifest.json')));
    }
    let bytes: Buffer;
    try {
      bytes = host.tamper.get(url) ?? readFileSync(path.join(dir, url));
    } catch {
      res.statusCode = 404;
      return void res.end();
    }
    const nth = ++fileRequests;
    const fault = host.fault?.({ url, range: req.headers.range, nth });
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
    if (m && fault !== 'ignore-range') {
      const start = Number(m[1]);
      const end = Math.min(Number(m[2]), bytes.length - 1);
      const slice = bytes.subarray(start, end + 1);
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${bytes.length}`);
      res.setHeader('content-length', slice.length);
      if (fault === 'drop') {
        res.write(slice.subarray(0, Math.floor(slice.length / 2)));
        return void setTimeout(() => req.socket.destroy(), 5);
      }
      return void res.end(slice);
    }
    res.setHeader('content-length', bytes.length);
    if (fault === 'drop') {
      res.write(bytes.subarray(0, Math.floor(bytes.length / 2)));
      return void setTimeout(() => req.socket.destroy(), 5);
    }
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  host.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return host;
}

const RANGE = 1000;
const bigText = (tag: string) => `${tag}\t` + 'مفتاح '.repeat(600); // a bit over 3 ranges of 1000 bytes
const smallText = (tag: string) => `{"tag":"${tag}"}`;

let work: string;
let packsRoot: string;
let repo: string;
let keys: Awaited<ReturnType<typeof generateSigningKey>>;
let host: Host;
let tdb: ArabicReaderDB;
let blobDb: BlobDB;
let blobs: BlobStore;
let n = 0;

function writePack(version: number, tag: string, minAppVersion = '0.1.0', over: Record<string, unknown> = {}) {
  const dir = path.join(packsRoot, 'alsihah');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'pack.json'),
    JSON.stringify({
      id: 'alsihah',
      version,
      title: 'Al-Sihah',
      kind: 'dictionary',
      licence: { spdx: 'LicenseRef-test', source: 'https://example.org', attribution: 'test' },
      ...over,
    }),
  );
  writeFileSync(path.join(dir, 'alsihah.tsv'), bigText(tag));
  writeFileSync(path.join(dir, 'meta.json'), smallText(tag));
  return { minAppVersion };
}

async function publish(version: number, tag: string, minAppVersion = '0.1.0', over: Record<string, unknown> = {}): Promise<string> {
  writePack(version, tag, minAppVersion, over);
  await lib.buildRepository({ packsRoot, out: repo, privateKeyJwk: keys.privateKeyJwk, minAppVersion });
  return readFileSync(path.join(repo, 'manifest.json'), 'utf8');
}

function manager(over: { baseUrl?: string; appVersion?: string; trusted?: string[]; fetchImpl?: typeof fetch; blobStore?: BlobStore } = {}): PackManager {
  return createPackManager({
    packs: tdb.packs,
    meta: tdb.packMeta,
    parts: tdb.packParts,
    blobs: () => over.blobStore ?? blobs,
    baseUrl: () => over.baseUrl ?? host.url,
    trustedKeys: () => over.trusted ?? [keys.publicKey],
    appVersion: over.appVersion ?? '0.36.0',
    fetchImpl: over.fetchImpl ? () => over.fetchImpl! : undefined,
    rangeSize: RANGE,
    rangeThreshold: RANGE,
  });
}

beforeEach(async () => {
  work = mkdtempSync(path.join(os.tmpdir(), 'ar-packmgr-'));
  packsRoot = path.join(work, 'packs');
  repo = path.join(work, 'repo');
  mkdirSync(repo, { recursive: true });
  keys = await generateSigningKey();
  tdb = new ArabicReaderDB(`packs-test-${++n}`);
  blobDb = new BlobDB(`packs-blobs-test-${n}`);
  blobs = createBlobStore({ backend: createIdbBackend(blobDb.blobs), index: blobDb.blobIndex });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await host?.close();
  await tdb.delete();
  await blobDb.delete();
  rmSync(work, { recursive: true, force: true });
});

const withHost = async () => {
  host = await startHost(repo);
};

describe('PackManager: install, offline use and removal', () => {
  it('fetches the manifest, installs in ranges, and opens the pack from the device', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    expect(await packs.available()).toEqual([]); // nothing fetched yet
    expect(await packs.refresh()).toBe('updated');

    const [info] = await packs.available();
    expect(info).toMatchObject({ id: 'alsihah', version: 1, status: 'absent', licence: { spdx: 'LicenseRef-test' } });

    const seen: number[] = [];
    await packs.install('alsihah', { onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // progress only goes forward
    expect((await packs.status('alsihah'))?.status).toBe('ready');

    const handle = await packs.open('alsihah');
    expect(await handle.text('alsihah.tsv')).toBe(bigText('one'));
    expect(await handle.text('meta.json')).toBe(smallText('one'));
    expect((await blobs.usage()).pack.count).toBe(2);

    // The big file came in several ranges; nothing but Range travelled with the requests.
    const ranged = host.requests.filter((r) => r.range);
    expect(ranged.length).toBeGreaterThanOrEqual(3);
    for (const r of host.requests) {
      expect(Object.keys(r.headers).filter((h) => ['cookie', 'authorization', 'referer', 'origin'].includes(h))).toEqual([]);
    }

    // Offline from here on: it opens with the host gone.
    await host.close();
    expect((await (await packs.open('alsihah')).text('meta.json'))).toBe(smallText('one'));
  });

  it('starts offline: refresh fails soft, the cached list and installed pack still work', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');
    host.down = true;

    expect(await packs.refresh()).toBe('offline');
    expect((await packs.available())[0].status).toBe('ready');
    expect(await (await packs.open('alsihah')).text('meta.json')).toBe(smallText('one'));
    await expect(packs.install('alsihah')).resolves.toBeUndefined(); // everything is already here
  });

  it('removes a pack to free its bytes and installs it again', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');
    await packs.uninstall('alsihah');
    expect(await blobs.usage()).toEqual({});
    expect((await packs.status('alsihah'))?.status).toBe('absent');
    await expect(packs.open('alsihah')).rejects.toMatchObject({ code: 'not-offered' });

    await packs.install('alsihah');
    expect(await (await packs.open('alsihah')).text('alsihah.tsv')).toBe(bigText('one'));
  });

  it('does nothing without a host or a key, and says so', async () => {
    await publish(1, 'one');
    await withHost();
    const unconfigured = manager({ baseUrl: '' });
    expect(unconfigured.configured()).toBe(false);
    expect(await unconfigured.refresh()).toBe('not-configured');
    expect(manager({ trusted: [] }).configured()).toBe(false);
    expect(host.requests).toEqual([]);
  });
});

describe('PackManager: interrupted and damaged downloads', () => {
  it('resumes a killed download from the ranges it already holds', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    host.fault = ({ range, nth }) => (nth === 3 && range ? 'drop' : undefined); // dies on the third file request
    await expect(packs.install('alsihah')).rejects.toMatchObject({ code: 'offline' });
    expect((await packs.status('alsihah'))?.status).toBe('failed');
    expect(await tdb.packParts.count()).toBeGreaterThan(0); // finished ranges are kept
    expect(await packs.available().then((a) => a[0].installedVersion)).toBeUndefined(); // and nothing is half installed

    // A new manager: the app was restarted.
    host.fault = undefined;
    host.requests.length = 0;
    const restarted = manager();
    await restarted.install('alsihah');
    const asked = host.requests.filter((r) => r.url.startsWith('/p/')).map((r) => r.range);
    expect(asked).not.toContain('bytes=0-999'); // the first range was not fetched again
    expect(await (await restarted.open('alsihah')).text('alsihah.tsv')).toBe(bigText('one'));
    expect(await tdb.packParts.count()).toBe(0);
  });

  it('rejects a file whose bytes were changed on the wire, discards it, and recovers on retry', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    const manifest = JSON.parse(readFileSync(path.join(repo, 'manifest.json'), 'utf8')) as Manifest;
    const big = manifest.packs[0].files.find((f) => f.name === 'alsihah.tsv')!;
    const evil = Buffer.from(readFileSync(path.join(repo, 'p', big.hash)));
    evil[10] ^= 0xff; // same length, one flipped byte
    host.tamper.set(`/p/${big.hash}`, evil);

    await expect(packs.install('alsihah')).rejects.toMatchObject({ code: 'verification' });
    const info = await packs.status('alsihah');
    expect(info).toMatchObject({ status: 'failed', reason: expect.stringContaining('damaged') });
    expect(await blobs.usage()).toEqual({}); // the damaged file was not stored, and nothing else was either
    expect(await tdb.packs.count()).toBe(0);
    expect(await tdb.packParts.count()).toBe(0);

    host.tamper.clear();
    await packs.install('alsihah');
    expect((await packs.status('alsihah'))?.status).toBe('ready');
    expect(await (await packs.open('alsihah')).text('alsihah.tsv')).toBe(bigText('one'));
  });

  it('rejects a truncated download and a host that ignores ranges but sends the right file', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    host.fault = ({ nth }) => (nth === 1 ? 'drop' : undefined);
    await expect(packs.install('alsihah')).rejects.toBeInstanceOf(PackError);
    expect(await tdb.packs.count()).toBe(0);

    host.fault = ({ range }) => (range ? 'ignore-range' : undefined);
    await packs.install('alsihah');
    expect(await (await packs.open('alsihah')).text('alsihah.tsv')).toBe(bigText('one'));
  });

  it('stops on cancel without calling it a failure, and keeps what it has', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    const abort = new AbortController();
    host.fault = ({ nth }) => {
      if (nth === 2) abort.abort();
      return undefined;
    };
    await expect(packs.install('alsihah', { signal: abort.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect((await packs.status('alsihah'))?.status).toBe('absent'); // not "failed"
    host.fault = undefined;
    await packs.install('alsihah');
    expect((await packs.status('alsihah'))?.status).toBe('ready');
  });

  it('stops cleanly when the device is full, leaving the pack uninstalled', async () => {
    await publish(1, 'one');
    await withHost();
    const full = { ...blobs, put: () => Promise.reject(Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })) } as BlobStore;
    const packs = manager({ blobStore: full });
    await packs.refresh();
    await expect(packs.install('alsihah')).rejects.toMatchObject({ code: 'quota' });
    expect(await tdb.packs.count()).toBe(0);
  });
});

describe('PackManager: manifest checks', () => {
  it('ignores a manifest with a bad signature and keeps the last good one', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    expect(await packs.refresh()).toBe('updated');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Signed by someone else.
    const other = await generateSigningKey();
    const forged = await signManifest(JSON.parse(await publish(2, 'two')) as Manifest, await importPrivateKey(other.privateKeyJwk));
    host.manifestOverride = JSON.stringify({ ...forged, sequence: 99 });
    expect(await packs.refresh()).toBe('rejected');

    // Right key, but edited after signing.
    const edited = JSON.parse(readFileSync(path.join(repo, 'manifest.json'), 'utf8')) as Manifest;
    edited.packs[0].files[0].hash = 'f'.repeat(64);
    host.manifestOverride = JSON.stringify(edited);
    expect(await packs.refresh()).toBe('rejected');

    host.manifestOverride = 'not json at all';
    expect(await packs.refresh()).toBe('offline');
    expect((await packs.available())[0].version).toBe(1); // still the good one
  });

  it('refuses a rollback to an older signed manifest', async () => {
    const first = await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await publish(2, 'two');
    expect(await packs.refresh()).toBe('updated');
    expect((await packs.available())[0].version).toBe(2);

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    host.manifestOverride = first; // validly signed, but older
    expect(await packs.refresh()).toBe('rejected');
    expect((await packs.available())[0].version).toBe(2);

    host.manifestOverride = undefined;
    expect(await packs.refresh()).toBe('unchanged');
  });

  it('does not download for an app that is too old', async () => {
    await publish(1, 'one', '99.0.0');
    await withHost();
    const packs = manager({ appVersion: '0.36.0' });
    await packs.refresh();
    expect((await packs.available())[0]).toMatchObject({ status: 'absent', reason: 'Needs a newer app version.' });
    host.requests.length = 0;
    await expect(packs.install('alsihah')).rejects.toMatchObject({ code: 'needs-newer-app' });
    expect(host.requests).toEqual([]);
  });

  it('honours the kill switch: a withdrawn pack is not offered or used', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');

    await publish(1, 'one', '0.1.0', { enabled: false });
    await packs.refresh();
    expect((await packs.status('alsihah'))?.status).toBe('disabled');
    await expect(packs.open('alsihah')).rejects.toMatchObject({ code: 'disabled' });
    await expect(packs.install('alsihah')).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('PackManager: updates', () => {
  it('keeps the old version working until the new one is complete, then switches and frees the old bytes', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');
    const oldBytes = (await blobs.usage()).pack.bytes;

    await publish(2, 'two');
    await packs.refresh();
    expect((await packs.status('alsihah'))).toMatchObject({ status: 'update-available', installedVersion: 1, version: 2 });

    // The update dies half way: version 1 is untouched and still reads.
    let calls = 0;
    host.fault = () => (++calls === 3 ? 'drop' : undefined);
    await expect(packs.install('alsihah')).rejects.toBeInstanceOf(PackError);
    expect((await packs.open('alsihah')).version).toBe(1);
    expect(await (await packs.open('alsihah')).text('alsihah.tsv')).toBe(bigText('one'));

    host.fault = undefined;
    await packs.install('alsihah');
    expect((await packs.open('alsihah')).version).toBe(2);
    expect(await (await packs.open('alsihah')).text('alsihah.tsv')).toBe(bigText('two'));
    expect((await blobs.usage()).pack.bytes).toBeLessThanOrEqual(oldBytes + 10); // version 1's files are gone, not kept beside it
    expect((await packs.status('alsihah'))?.status).toBe('ready');
  });

  it('shares an unchanged file between versions instead of downloading it again', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');
    await publish(2, 'one'); // same files, new version number
    await packs.refresh();
    host.requests.length = 0;
    await packs.install('alsihah');
    expect(host.requests.filter((r) => r.url.startsWith('/p/'))).toEqual([]);
    expect((await packs.open('alsihah')).version).toBe(2);
  });

  it('releases references left by an install killed before it finished', async () => {
    await publish(1, 'one');
    await withHost();
    const packs = manager();
    await packs.refresh();
    await packs.install('alsihah');
    // What a killed first install of another pack, and a killed update, leave behind.
    await blobs.put(new TextEncoder().encode('stray'), { ns: 'pack', owner: 'ghost@1' });
    await blobs.put(new TextEncoder().encode('half'), { ns: 'pack', owner: 'alsihah@2' });
    await packs.repair();
    const owners: string[] = [];
    for await (const ref of blobs.list('pack')) owners.push(...ref.owners);
    expect([...new Set(owners)]).toEqual(['alsihah@1']);
    expect(await (await packs.open('alsihah')).text('meta.json')).toBe(smallText('one'));
  });
});
