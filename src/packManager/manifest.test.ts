import { describe, expect, it } from 'vitest';
import { canonicalJson as crowdCanonicalJson } from '../../crowd-server/src/protocol';
import {
  canonicalJson,
  compareVersions,
  fromBase64Url,
  generateSigningKey,
  importPrivateKey,
  manifestProblem,
  signManifest,
  toBase64Url,
  verifyManifest,
  type Manifest,
  type PackEntry,
} from './manifest';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const pack = (over: Partial<PackEntry> = {}): PackEntry => ({
  id: 'alsihah',
  version: 3,
  title: 'Al-Sihah',
  kind: 'dictionary',
  size: 30,
  files: [
    { name: 'index.json', hash: HASH_A, size: 10 },
    { name: 'data/entries.json', hash: HASH_B, size: 20 },
  ],
  licence: { spdx: 'CC0-1.0', source: 'https://example.org/sihah', attribution: 'Al-Jawhari' },
  enabled: true,
  ...over,
});

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  formatVersion: 1,
  sequence: 4,
  generatedAt: '2026-10-07T10:00:00.000Z',
  minAppVersion: '0.36.0',
  packs: [pack()],
  ...over,
});

async function signedWith(m: Manifest = manifest()) {
  const keys = await generateSigningKey();
  return { keys, signed: await signManifest(m, await importPrivateKey(keys.privateKeyJwk)) };
}

describe('manifest signing', () => {
  it('signs and verifies, and survives being sent as JSON', async () => {
    const { keys, signed } = await signedWith();
    expect(keys.publicKey).toHaveLength(87); // 65 raw bytes, base64url
    const result = await verifyManifest(JSON.parse(JSON.stringify(signed)), [keys.publicKey]);
    expect(result.ok).toBe(true);
  });

  it('ignores key order and whitespace, as the signature covers the canonical form', async () => {
    const { keys, signed } = await signedWith();
    const shuffled = JSON.parse(JSON.stringify({ packs: signed.packs, signature: signed.signature, sequence: signed.sequence, minAppVersion: signed.minAppVersion, generatedAt: signed.generatedAt, formatVersion: 1 }));
    expect((await verifyManifest(shuffled, [keys.publicKey])).ok).toBe(true);
  });

  it('rejects any change after signing', async () => {
    const { keys, signed } = await signedWith();
    const tampered: Record<string, (m: Manifest) => void> = {
      'a pack version': (m) => void (m.packs[0].version = 99),
      'a file hash': (m) => void (m.packs[0].files[0].hash = HASH_B),
      'a file size': (m) => void (m.packs[0].files[0].size += 1),
      'a licence': (m) => void (m.packs[0].licence.spdx = 'MIT'),
      'the kill flag': (m) => void (m.packs[0].enabled = false),
      'the minimum app version': (m) => void (m.minAppVersion = '0.1.0'),
      'the sequence': (m) => void (m.sequence = 1),
      'an added pack': (m) => void m.packs.push(pack({ id: 'extra' })),
    };
    for (const [what, change] of Object.entries(tampered)) {
      const copy = JSON.parse(JSON.stringify(signed)) as Manifest;
      change(copy);
      // A size change would also break the size sum; re-sum so only the signature can catch it.
      copy.packs[0].size = copy.packs[0].files.reduce((n, f) => n + f.size, 0);
      const result = await verifyManifest(copy, [keys.publicKey]);
      expect(result.ok, `${what} must be rejected`).toBe(false);
    }
  });

  it('rejects an unsigned manifest, a garbled signature and a signature from another key', async () => {
    const { keys, signed } = await signedWith();
    const { signature: _drop, ...unsigned } = signed;
    expect(await verifyManifest(unsigned, [keys.publicKey])).toEqual({ ok: false, reason: 'the manifest is not signed' });
    expect((await verifyManifest({ ...signed, signature: '!!!not base64!!!' }, [keys.publicKey])).ok).toBe(false);
    expect((await verifyManifest({ ...signed, signature: toBase64Url(new Uint8Array(64)) }, [keys.publicKey])).ok).toBe(false);
    const other = await generateSigningKey();
    expect(await verifyManifest(signed, [other.publicKey])).toEqual({ ok: false, reason: 'the signature is not from a trusted key' });
    expect((await verifyManifest(signed, [])).ok).toBe(false);
    expect((await verifyManifest(signed, ['not a key'])).ok).toBe(false);
  });

  it('accepts either of two keys, so a rotation needs no app update', async () => {
    const current = await generateSigningKey();
    const next = await generateSigningKey();
    const signedByNext = await signManifest(manifest(), await importPrivateKey(next.privateKeyJwk));
    expect((await verifyManifest(signedByNext, [current.publicKey, next.publicKey])).ok).toBe(true);
    expect((await verifyManifest(signedByNext, [current.publicKey])).ok).toBe(false);
  });

  it('refuses to sign what must not be published', async () => {
    const key = await importPrivateKey((await generateSigningKey()).privateKeyJwk);
    const refuse = async (m: Manifest, message: RegExp) => expect(signManifest(m, key)).rejects.toThrow(message);
    await refuse(manifest({ packs: [pack({ licence: { spdx: '', source: 'x', attribution: 'y' } })] }), /licence/);
    await refuse(manifest({ packs: [pack({ licence: { spdx: 'MIT', source: 'x', attribution: '  ' } })] }), /licence/);
    await refuse(manifest({ packs: [pack({ size: 31 })] }), /does not match its files/);
    await refuse(manifest({ packs: [pack({ files: [] })] }), /at least one file/);
    await refuse(manifest({ packs: [pack({ files: [{ name: '../escape.json', hash: HASH_A, size: 30 }] })] }), /bad file name/);
    await refuse(manifest({ packs: [pack({ files: [{ name: 'a.json', hash: 'xyz', size: 30 }] })] }), /SHA-256/);
    await refuse(manifest({ packs: [pack(), pack()] }), /listed twice/);
    await refuse(manifest({ packs: [pack({ id: 'Bad Id' })] }), /pack id/);
    await refuse(manifest({ formatVersion: 2 }), /unsupported format version/);
    await refuse(manifest({ minAppVersion: 'latest' }), /minAppVersion/);
  });

  it('does not throw on junk input', async () => {
    for (const junk of [null, 5, 'text', [], {}, { formatVersion: 1 }]) {
      expect((await verifyManifest(junk, ['x'])).ok).toBe(false);
    }
  });
});

describe('helpers', () => {
  it('writes canonical JSON exactly as the crowd service does', () => {
    const value = { b: [1, { z: 1, a: null }], a: 'ö"', c: undefined, d: 1.5 };
    expect(canonicalJson(value)).toBe(crowdCanonicalJson(value));
    expect(canonicalJson(value)).toBe('{"a":"ö\\"","b":[1,{"a":null,"z":1}],"d":1.5}');
  });

  it('round-trips base64url and compares versions', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    expect(compareVersions('0.36.0', '0.100.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
  });

  it('accepts a good manifest', () => {
    expect(manifestProblem(manifest())).toBeNull();
  });
});
