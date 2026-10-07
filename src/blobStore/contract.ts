import type { Table } from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlobStore } from './blobStore';
import type { BlobIndexRow } from './db';
import { sha256Hex } from './hash';
import { QuotaError, UndeclaredNamespaceError, type BlobRef, type BlobStore, type ByteBackend } from './types';

/**
 * The behaviour every BlobStore backend must have (data-architecture section
 * 13). Each backend's test file calls this with a factory for a fresh, empty
 * backend and index.
 */
export interface ContractEnv {
  backend: ByteBackend;
  index: Table<BlobIndexRow, string>;
  cleanup(): Promise<void>;
}

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const text = (s: string) => new TextEncoder().encode(s);

async function collect(it: AsyncIterable<BlobRef>): Promise<BlobRef[]> {
  const out: BlobRef[] = [];
  for await (const ref of it) out.push(ref);
  return out;
}

/** A backend that refuses to grow beyond `maxBytes`, as a full device would. */
function withQuota(backend: ByteBackend, maxBytes: number): ByteBackend {
  return {
    ...backend,
    async write(hash, data) {
      let used = 0;
      for (const h of await backend.hashes()) used += (await backend.read(h, ''))?.size ?? 0;
      if (used + data.size > maxBytes) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      await backend.write(hash, data);
    },
  };
}

/** A small deterministic PRNG, so a failing sequence can be replayed from its seed. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blobStoreContract(name: string, makeEnv: () => Promise<ContractEnv>): void {
  describe(`BlobStore contract: ${name}`, () => {
    let env: ContractEnv;
    let store: BlobStore;

    beforeEach(async () => {
      env = await makeEnv();
      store = createBlobStore({ backend: env.backend, index: env.index });
    });
    afterEach(() => env.cleanup());

    it('round-trips bytes under their SHA-256', async () => {
      const ref = await store.put(text('hello'), { ns: 'book', owner: 'b1', type: 'application/epub+zip' });
      expect(ref).toMatchObject({ hash: HELLO_SHA256, size: 5, type: 'application/epub+zip', ns: 'book', owners: ['b1'] });
      const blob = await store.get(HELLO_SHA256);
      expect(await blob?.text()).toBe('hello');
      expect(blob?.type).toBe('application/epub+zip');
      expect(await store.has(HELLO_SHA256)).toBe(true);
      expect(await store.verify(HELLO_SHA256)).toBe(true);

      const fromBlob = await store.put(new Blob(['a font'], { type: 'font/ttf' }), { ns: 'font', owner: 'f1' });
      expect(fromBlob.type).toBe('font/ttf');
      expect(await (await store.get(fromBlob.hash))?.text()).toBe('a font');
    });

    it('answers nothing for an unknown or malformed hash', async () => {
      expect(await store.get('0'.repeat(64))).toBeUndefined();
      expect(await store.has('0'.repeat(64))).toBe(false);
      expect(await store.get('../../etc/passwd')).toBeUndefined();
      expect(await store.verify('0'.repeat(64))).toBe(false);
      expect(await store.url('0'.repeat(64))).toBeUndefined();
    });

    it('gives an object URL for playback', async () => {
      const { hash } = await store.put(text('hello'), { ns: 'book', owner: 'b1' });
      const url = await store.url(hash);
      expect(url).toMatch(/^blob:/);
      URL.revokeObjectURL(url!);
    });

    it('stores the same bytes once, however often they are put', async () => {
      const a = await store.put(text('same'), { ns: 'book', owner: 'b1' });
      const b = await store.put(text('same'), { ns: 'book', owner: 'b1' });
      const c = await store.put(new Blob(['same']), { ns: 'book', owner: 'b2' });
      expect(new Set([a.hash, b.hash, c.hash]).size).toBe(1);
      expect(await env.backend.hashes()).toEqual([a.hash]);
      expect(await store.usage()).toEqual({ book: { count: 1, bytes: 4 } });
      expect((await collect(store.list('book')))[0].owners).toEqual(['b1', 'b2']);
    });

    it('keeps references apart when puts race', async () => {
      const refs = await Promise.all(['b1', 'b2', 'b3', 'b4'].map((owner) => store.put(text('race'), { ns: 'book', owner })));
      expect((await collect(store.list('book')))[0].owners).toEqual(['b1', 'b2', 'b3', 'b4']);
      expect(await env.backend.hashes()).toEqual([refs[0].hash]);

      // Index updates with no hashing in between must not lose each other either.
      const hash = refs[0].hash;
      await Promise.all(['f1', 'f2', 'f3'].map((owner) => store.pin(hash, 'font', owner)));
      await Promise.all([store.unpin(hash, 'book', 'b1'), store.unpin(hash, 'book', 'b2'), store.pin(hash, 'pack', 'p1')]);
      const owners = (await collect(store.list())).map((r) => `${r.ns}:${r.owners.join(',')}`).sort();
      expect(owners).toEqual(['book:b3,b4', 'font:f1,f2,f3', 'pack:p1']);
    });

    it('counts owners and frees the bytes only when none remain', async () => {
      const { hash } = await store.put(text('shared'), { ns: 'book', owner: 'b1' });
      await store.put(text('shared'), { ns: 'book', owner: 'b2' });
      expect(await store.pin(hash, 'font', 'f1')).toBe(true);

      await store.unpin(hash, 'book', 'b1');
      expect(await store.has(hash)).toBe(true);
      await store.unpin(hash, 'book', 'b1'); // already gone: no effect
      await store.delete(hash, 'book'); // drops b2
      expect(await store.has(hash)).toBe(true);
      expect(await store.usage()).toEqual({ font: { count: 1, bytes: 6 } });
      expect(await collect(store.list('book'))).toEqual([]);

      await store.unpin(hash, 'font', 'f1');
      expect(await store.has(hash)).toBe(false);
      expect(await store.get(hash)).toBeUndefined();
      expect(await env.backend.hashes()).toEqual([]);
      expect(await store.usage()).toEqual({});
    });

    it('does not pin what is not stored', async () => {
      expect(await store.pin(HELLO_SHA256, 'book', 'b1')).toBe(false);
      expect(await store.has(HELLO_SHA256)).toBe(false);
    });

    it('refuses namespaces the StorageRegistry does not declare, storing nothing', async () => {
      await expect(store.put(text('x'), { ns: 'scratch', owner: 'o' })).rejects.toBeInstanceOf(UndeclaredNamespaceError);
      await expect(store.put(text('x'), { ns: 'book', owner: '' })).rejects.toThrow();
      expect(await env.backend.hashes()).toEqual([]);
    });

    it('lists and measures by namespace', async () => {
      await store.put(text('book one'), { ns: 'book', owner: 'b1' });
      await store.put(text('pack file'), { ns: 'pack', owner: 'alsihah@3' });
      const both = await store.put(text('both'), { ns: 'book', owner: 'b2' });
      await store.pin(both.hash, 'pack', 'alsihah@3');

      expect((await collect(store.list('book'))).map((r) => r.size).sort()).toEqual([4, 8]);
      expect((await collect(store.list())).length).toBe(4);
      expect(await store.usage()).toEqual({ book: { count: 2, bytes: 12 }, pack: { count: 2, bytes: 13 } });
    });

    it('repairs a crash between writing the bytes and indexing them', async () => {
      // What a put killed after its first write leaves behind.
      const hash = await sha256Hex(text('half'));
      await env.backend.write(hash, new Blob([text('half') as Uint8Array<ArrayBuffer>]));
      expect(await store.has(hash)).toBe(false);
      expect(await store.repair()).toEqual({ orphansRemoved: [hash], missing: [] });
      expect(await env.backend.hashes()).toEqual([]);
      // And the same file can then be stored normally.
      await store.put(text('half'), { ns: 'book', owner: 'b1' });
      expect(await store.has(hash)).toBe(true);
      expect(await store.repair()).toEqual({ orphansRemoved: [], missing: [] });
    });

    it('notices bytes lost outside the app, and takes them back on the next put', async () => {
      const { hash } = await store.put(text('lost'), { ns: 'book', owner: 'b1' });
      await env.backend.delete(hash);
      expect(await store.has(hash)).toBe(false);
      expect(await store.get(hash)).toBeUndefined();

      await store.put(text('lost'), { ns: 'book', owner: 'b1' });
      expect(await store.has(hash)).toBe(true);

      await env.backend.delete(hash);
      expect(await store.repair()).toEqual({ orphansRemoved: [], missing: [hash] });
      expect(await store.usage()).toEqual({});
    });

    it('leaves nothing half-indexed when the bytes do not fit', async () => {
      const full = createBlobStore({ backend: withQuota(env.backend, 10), index: env.index });
      await full.put(text('small'), { ns: 'book', owner: 'b1' });
      const err = await full.put(text('far too large'), { ns: 'book', owner: 'b2' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(QuotaError);
      expect(await full.usage()).toEqual({ book: { count: 1, bytes: 5 } });
      expect((await env.backend.hashes()).length).toBe(1);
      expect(await full.repair()).toEqual({ orphansRemoved: [], missing: [] });
    });

    it('leaves nothing half-indexed when the index write runs out of space', async () => {
      const refuse = () => {
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      };
      env.index.hook('creating', refuse);
      try {
        await expect(store.put(text('no room'), { ns: 'book', owner: 'b1' })).rejects.toBeInstanceOf(QuotaError);
      } finally {
        env.index.hook('creating').unsubscribe(refuse);
      }
      expect(await env.backend.hashes()).toEqual([]);
      expect(await env.index.count()).toBe(0);
    });

    it('matches a reference model over random sequences of operations', async () => {
      const payloads = ['alpha', 'beta', 'gamma'].map(text);
      const hashes = await Promise.all(payloads.map((p) => sha256Hex(p)));
      const refs = [
        ['book', 'b1'],
        ['book', 'b2'],
        ['font', 'f1'],
      ] as const;

      for (const seed of [1, 2, 3]) {
        const rand = prng(seed);
        const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
        const model = new Map<string, Set<string>>();
        for (let step = 0; step < 40; step++) {
          const i = Math.floor(rand() * payloads.length);
          const [ns, owner] = pick(refs);
          const held = model.get(hashes[i]);
          const op = pick(['put', 'put', 'pin', 'unpin', 'delete'] as const);
          if (op === 'put') {
            await store.put(payloads[i], { ns, owner });
            model.set(hashes[i], new Set([...(held ?? []), `${ns}/${owner}`]));
          } else if (op === 'pin') {
            expect(await store.pin(hashes[i], ns, owner)).toBe(Boolean(held));
            held?.add(`${ns}/${owner}`);
          } else if (op === 'unpin') {
            await store.unpin(hashes[i], ns, owner);
            held?.delete(`${ns}/${owner}`);
          } else {
            await store.delete(hashes[i], ns);
            for (const r of held ?? []) if (r.startsWith(`${ns}/`)) held!.delete(r);
          }
          if (held && held.size === 0) model.delete(hashes[i]);

          const where = `seed ${seed}, step ${step}, ${op} ${ns}/${owner} #${i}`;
          expect((await env.backend.hashes()).sort(), where).toEqual([...model.keys()].sort());
          for (const h of hashes) expect(await store.has(h), where).toBe(model.has(h));
        }
        for (const h of model.keys()) for (const [ns] of refs) await store.delete(h, ns);
        expect(await env.backend.hashes()).toEqual([]);
      }
    });
  });
}
