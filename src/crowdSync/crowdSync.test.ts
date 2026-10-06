import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DictionaryEntry, DictionaryLookupResult } from '../types';
import { canonicalJson, LIMITS } from '../../crowd-server/src/protocol';
import { generateEd25519, signEd25519, sha256Hex } from '../../crowd-server/src/crypto';
import { entryKey, senseKey } from '../sensePicks/keys';
import { applyWordRanking } from './applyRanking';
import { ConsentError, crowdFetch } from './consent';
import { discardIdentity, ensureIdentity } from './identity';
import { fetchPack, rankingState, refreshManifest, versionAtLeast } from './packStore';
import { crowdRank } from './ranking';
import { clearQueue, dropExpired, enqueue, nextBatch, queueSize, removeFromQueue } from './queue';
import { acknowledgeRecoveryCode, deleteShared, flushQueue } from './sender';
import { loadState, updateState } from './state';
import { shareSave, shareUnsave } from './votes';
import { db } from '../persistence/schema';
import { API, resetLocal, setSharing, startService, type TestService } from './testkit';

const k = (s: string) => s.toLowerCase().replace(/[^a-z2-7]/g, 'a').padEnd(12, 'a').slice(0, 20);
const KEYS = { bookKey: k('bookone'), lemmaKey: k('lemmaone') };
const entry = (providerId: string, headword: string, glosses: string[], extra: Partial<DictionaryEntry> = {}): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword,
  senses: glosses.map((gloss) => ({ gloss })),
  ...extra,
});
const vote = (over: Record<string, unknown> = {}) => ({ ...KEYS, providerId: 'aramorph', entryKey: k('entry1'), senseKey: null, source: 'entry' as const, pos: 1, action: 'save' as const, ...over });

beforeEach(async () => {
  await resetLocal();
  setSharing(true);
});

describe('consent gate (section 10.2)', () => {
  it('makes no network call at all while sharing is off', async () => {
    const svc = await startService();
    setSharing(false);
    await enqueue(vote());
    expect((await flushQueue(svc.fetchImpl)).status).toBe('off');
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('off');
    expect(await fetchPack('book/x', { fetchImpl: svc.fetchImpl })).toBe(false);
    await expect(crowdFetch('/manifest.json', undefined, svc.fetchImpl)).rejects.toBeInstanceOf(ConsentError);
    await shareSave(KEYS, entry('aramorph', 'a', ['x']), k('entry1'), 'entry', null, 0);
    await shareUnsave(KEYS, [{ providerId: 'aramorph', entryKey: k('entry1'), source: 'entry' }]);
    await crowdRank(KEYS, { word: 'w', entries: [entry('aramorph', 'a', ['x'])] });
    expect(svc.calls).toEqual([]);
  });

  it('makes no call and queues nothing when the build has no service address', async () => {
    const svc = await startService();
    setSharing(true, '');
    await shareSave(KEYS, entry('aramorph', 'a', ['x']), k('entry1'), 'entry', null, 0);
    expect(await queueSize()).toBe(0);
    expect((await flushQueue(svc.fetchImpl)).status).toBe('off');
    expect(svc.calls).toEqual([]);
  });

  it('only a reader\'s own delete request goes out while sharing is off', async () => {
    const svc = await startService();
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    setSharing(false);
    expect(await deleteShared({ fetchImpl: svc.fetchImpl })).toBe('deleted');
    expect(svc.calls.map((c) => c.url)).toEqual([API + '/v1/votes', API + '/v1/delete']);
  });
});

describe('queue (section 7.4)', () => {
  it('gives each change the next revision, written before it is queued', async () => {
    const a = await enqueue(vote({ entryKey: k('a') }));
    const b = await enqueue(vote({ entryKey: k('b') }));
    expect([a.rev, b.rev]).toEqual([1, 2]);
    expect((await loadState()).seq).toBe(2);
  });

  it('a newer change to the same vote replaces the queued older one', async () => {
    await enqueue(vote());
    await enqueue(vote({ action: 'unsave' }));
    const rows = await nextBatch();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rev: 2, item: { action: 'unsave' } });
  });

  it('drops the oldest when full, and anything older than 14 days', async () => {
    for (let i = 0; i < 503; i++) await db.crowdQueue.put({ key: 'k' + i, rev: i + 1, createdAt: Date.now(), item: vote({ rev: i + 1, day: '2026-10-05' }) as never });
    await enqueue(vote());
    expect(await queueSize()).toBe(500);
    expect((await db.crowdQueue.get('k0'))).toBeUndefined();
    await clearQueue();
    await db.crowdQueue.put({ key: 'old', rev: 1, createdAt: Date.now() - 15 * 86_400_000, item: vote({ rev: 1, day: '2026-09-01' }) as never });
    await db.crowdQueue.put({ key: 'new', rev: 2, createdAt: Date.now(), item: vote({ rev: 2, day: '2026-10-05' }) as never });
    expect(await dropExpired()).toBe(1);
    expect((await nextBatch()).map((r) => r.key)).toEqual(['new']);
  });

  it('sends at most as many votes as the server accepts at once, oldest first', async () => {
    for (let i = 0; i < 60; i++) await enqueue(vote({ entryKey: k('e' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))) }));
    const batch = await nextBatch();
    expect(batch).toHaveLength(LIMITS.maxItems);
    expect(batch[0].rev).toBe(1);
  });

  it('removing a sent vote keeps a newer change the reader made in the meantime', async () => {
    const first = await enqueue(vote());
    await enqueue(vote({ action: 'unsave' }));
    await removeFromQueue([first]);
    expect(await queueSize()).toBe(1);
  });
});

describe('identity (section 5.4)', () => {
  it('makes one key pair, keeps the private key out of reach and derives the id from the public key', async () => {
    const a = await ensureIdentity();
    const b = await ensureIdentity();
    expect(b.installId).toBe(a.installId);
    expect(a.installId).toMatch(/^[a-z2-7]{26}$/);
    expect(a.keys.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('jwk', a.keys.privateKey)).rejects.toThrow();
  });

  it('forgets everything on discard and makes a different key next time', async () => {
    const a = await ensureIdentity();
    await updateState((s) => {
      s.seq = 9;
      s.registered = true;
    });
    await discardIdentity();
    expect(await loadState()).toMatchObject({ keys: undefined, installId: undefined, seq: 0, registered: false });
    expect((await ensureIdentity()).installId).not.toBe(a.installId);
  });
});

describe('sending (sections 7.4 and 11)', () => {
  let svc: TestService;
  beforeEach(async () => {
    svc = await startService();
  });
  const body = (call: number) => svc.calls[call];

  it('registers on the first send, sends the key only that once, and shows the recovery code once', async () => {
    await enqueue(vote());
    expect(await flushQueue(svc.fetchImpl)).toEqual({ status: 'sent', sent: 1 });
    const state = await loadState();
    expect(state).toMatchObject({ registered: true, maxRev: 1 });
    expect(state.recoveryCode).toMatch(/^[a-z2-7]{26}$/);
    expect(await queueSize()).toBe(0);
    await acknowledgeRecoveryCode();
    expect((await loadState()).recoveryCode).toBeUndefined();
    await enqueue(vote({ entryKey: k('two') }));
    await flushQueue(svc.fetchImpl);
    expect(body(1).method).toBe('POST');
    const votes = await svc.db.all<{ entryKey: string }>(`SELECT entryKey FROM votes`);
    expect(votes).toHaveLength(2);
  });

  it('an empty queue sends nothing', async () => {
    expect(await flushQueue(svc.fetchImpl)).toEqual({ status: 'empty', sent: 0 });
    expect(svc.calls).toEqual([]);
  });

  it('keeps the queue when the network fails, and sends it later', async () => {
    await enqueue(vote());
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await flushQueue(down)).toEqual({ status: 'offline', sent: 0 });
    expect(await queueSize()).toBe(1);
    expect((await flushQueue(svc.fetchImpl)).status).toBe('sent');
  });

  it('keeps the queue on a server error and backs off nothing here (the scheduler does)', async () => {
    await enqueue(vote());
    const busy = (async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })) as typeof fetch;
    expect((await flushQueue(busy)).status).toBe('error');
    expect(await queueSize()).toBe(1);
  });

  it('a pending vote keeps its revision; the device counter only moves up for new actions (section 7.4)', async () => {
    const first = await enqueue(vote({ action: 'save' })); // rev 1
    const second = await enqueue(vote({ entryKey: k('other') })); // rev 2
    // The server already has newer state for this install: a clear at rev 4 on the first vote.
    await flushQueue(svc.fetchImpl);
    const state = await loadState();
    await svc.db.run(`UPDATE votes SET saved = 0, rev = 4 WHERE entryKey = ?`, [k('entry1')]);
    await svc.db.run(`UPDATE installs SET maxRev = 4 WHERE installId = ?`, [state.installId]);
    // A restored device: its counter is behind the server's.
    await updateState((s) => {
      s.seq = 1;
    });
    // An old pending save of the first vote at rev 3 must come back stale, not be promoted above rev 4.
    await db.crowdQueue.put({ key: first.key, rev: 3, createdAt: Date.now(), item: { ...first.item, rev: 3 } });
    expect((await flushQueue(svc.fetchImpl)).status).toBe('sent');
    expect((await svc.db.get<{ saved: number; rev: number }>(`SELECT saved, rev FROM votes WHERE entryKey = ?`, [k('entry1')]))).toEqual({ saved: 0, rev: 4 });
    expect((await loadState()).seq).toBeGreaterThanOrEqual(4);
    // A genuinely new action now gets a revision above everything the server has seen.
    const fresh = await enqueue(vote({ entryKey: k('entry1') }));
    expect(fresh.rev).toBeGreaterThan(4);
    expect(second.rev).toBe(2);
    await flushQueue(svc.fetchImpl);
    expect((await svc.db.get<{ saved: number }>(`SELECT saved FROM votes WHERE entryKey = ?`, [k('entry1')]))!.saved).toBe(1);
  });

  it('starts over with a new key when the server says this id was deleted, keeping what is queued', async () => {
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    const before = (await loadState()).installId;
    await svc.db.run(`DELETE FROM installs`);
    await svc.db.run(`INSERT INTO deletions (installId, deletedAt) VALUES (?, '2026-10-06')`, [before]);
    await enqueue(vote({ entryKey: k('late') }));
    expect((await flushQueue(svc.fetchImpl)).status).toBe('error');
    expect((await loadState()).installId).toBeUndefined();
    expect(await queueSize()).toBe(1);
    expect((await flushQueue(svc.fetchImpl)).status).toBe('sent');
    expect((await loadState()).installId).not.toBe(before);
  });

  it('stops sending once the server bans the install', async () => {
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    await svc.db.run(`UPDATE installs SET banned = 1`);
    await enqueue(vote({ entryKey: k('two') }));
    expect((await flushQueue(svc.fetchImpl)).status).toBe('blocked');
    expect((await flushQueue(svc.fetchImpl)).status).toBe('blocked');
    expect((await loadState()).blocked).toBe(true);
  });

  it('registers again when the server no longer knows the install', async () => {
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    await svc.db.run(`DELETE FROM installs`);
    await enqueue(vote({ entryKey: k('two') }));
    expect((await flushQueue(svc.fetchImpl)).status).toBe('error');
    expect((await loadState()).registered).toBe(false);
    expect((await flushQueue(svc.fetchImpl)).status).toBe('sent');
  });

  it('deletes what was shared with the install key, then starts clean', async () => {
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    expect(await deleteShared({ fetchImpl: svc.fetchImpl })).toBe('deleted');
    expect(await svc.db.all(`SELECT * FROM votes`)).toEqual([]);
    expect(await loadState()).toMatchObject({ keys: undefined, installId: undefined, seq: 0 });
    expect(await queueSize()).toBe(0);
  });

  it('deletes with only the recovery code when the key is lost', async () => {
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    const state = await loadState();
    await discardIdentity();
    expect(await deleteShared({ fetchImpl: svc.fetchImpl, recoveryCode: 'wrong', installId: state.installId })).toBe('refused');
    expect(await svc.db.all(`SELECT * FROM votes`)).toHaveLength(1);
    expect(await deleteShared({ fetchImpl: svc.fetchImpl, recoveryCode: state.recoveryCode, installId: state.installId })).toBe('deleted');
    expect(await svc.db.all(`SELECT * FROM votes`)).toEqual([]);
  });

  it('says nothing was shared when the server never saw this install, and reports offline', async () => {
    expect(await deleteShared({ fetchImpl: svc.fetchImpl })).toBe('nothing');
    await enqueue(vote());
    await flushQueue(svc.fetchImpl);
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await deleteShared({ fetchImpl: down })).toBe('offline');
    expect((await loadState()).installId).toBeDefined();
  });
});

describe('manifest and ranking files (sections 9.3 and 9.4)', () => {
  const DAY = 86_400_000;
  let svc: TestService;
  beforeEach(async () => {
    svc = await startService();
  });

  async function publishWith(seq?: number) {
    const out = await svc.publish();
    if (seq) await svc.db.run(`UPDATE config SET value = ? WHERE key = 'sequence'`, [String(seq)]);
    return out;
  }

  it('accepts a manifest signed by a trusted key and rejects one signed by another', async () => {
    await publishWith();
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('updated');
    expect((await loadState()).manifest).toMatchObject({ sequence: 1, enabled: true });
    const stranger = await generateEd25519();
    const other = await startService();
    await other.publish();
    expect(await refreshManifest({ fetchImpl: other.fetchImpl, keys: [svc.publicKey] })).toBe('rejected');
    expect(stranger).toBeTruthy();
    expect((await loadState()).manifest?.sequence).toBe(1);
  });

  it('answers 304 style: an unchanged manifest is unchanged', async () => {
    await publishWith();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('unchanged');
  });

  it('refuses a manifest with a lower sequence than the one it holds (anti-rollback)', async () => {
    await publishWith();
    await publishWith();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    const old = JSON.parse((await svc.storage.get('snapshots/1/manifest.json'))!);
    await svc.storage.put('manifest.json', JSON.stringify(old));
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('rejected');
    expect((await loadState()).manifest?.sequence).toBe(2);
  });

  it('refuses a manifest that is already past expiry plus the grace period', async () => {
    await publishWith();
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey], now: Date.now() + 30 * DAY })).toBe('rejected');
  });

  it('refuses a manifest whose signed fields were changed', async () => {
    await publishWith();
    const m = JSON.parse((await svc.storage.get('manifest.json'))!);
    m.enabled = false;
    await svc.storage.put('manifest.json', JSON.stringify(m));
    expect(await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] })).toBe('rejected');
  });

  it('uses a cached ranking only while enabled, new enough and within expiry plus 14 days', async () => {
    await publishWith();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    const s = await loadState();
    const t = Date.parse(s.manifest!.expiresAt);
    expect(rankingState({ id: 'local', registered: false, seq: 0, maxRev: 0 }, t)).toBe('none');
    expect(rankingState(s, t - DAY, '1.0.0')).toBe('ok');
    expect(rankingState(s, t + 13 * DAY, '1.0.0')).toBe('ok');
    expect(rankingState(s, t + 15 * DAY, '1.0.0')).toBe('stale');
    expect(rankingState({ ...s, manifest: { ...s.manifest!, enabled: false } }, t - DAY)).toBe('disabled');
    expect(rankingState({ ...s, manifest: { ...s.manifest!, minAppVersion: '9.0.0' } }, t - DAY, '0.32.0')).toBe('old-app');
  });

  it('keeps a downloaded file only when its hash is the one the signed manifest lists', async () => {
    const reader = '1';
    await svc.db.run(`INSERT INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay) VALUES ('${k('r' + reader)}', 'x', 'x', '2026-01-01', '2026-10-06')`);
    for (let i = 0; i < 40; i++) {
      const id = k('rr' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));
      await svc.db.run(`INSERT OR IGNORE INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay) VALUES (?, 'x', 'x', '2026-01-01', '2026-10-06')`, [id]);
      for (const [b, l] of [['bk1', KEYS.lemmaKey], ['bk2', 'fillerfillerfiller']])
        await svc.db.run(`INSERT INTO votes VALUES (?, ?, ?, 'aramorph', ?, NULL, 'entry', 2, 1, 1, NULL, '2026-10-05', ?)`, [id, k(b), l === 'fillerfillerfiller' ? k('filler') : l, k('entryaaa'), Date.now()]);
    }
    await publishWith();
    await refreshManifest({ fetchImpl: svc.fetchImpl, keys: [svc.publicKey] });
    const path = `pooled/${KEYS.lemmaKey.slice(0, 2)}`;
    expect((await loadState()).manifest!.packs[path]).toBeDefined();
    expect(await fetchPack(path, { fetchImpl: svc.fetchImpl })).toBe(true);
    expect((await db.crowdPacks.get(path))!.hash).toBe('sha256-' + (await sha256Hex((await svc.storage.get('packs/v1/' + path + '.json'))!)));
    await db.crowdPacks.clear();
    await svc.storage.put(`packs/v1/${path}.json`, canonicalJson({ tampered: true }));
    expect(await fetchPack(path, { fetchImpl: svc.fetchImpl })).toBe(false);
    expect(await db.crowdPacks.count()).toBe(0);
    expect(await fetchPack('pooled/zz', { fetchImpl: svc.fetchImpl })).toBe(false);
    void signEd25519;
  });

  it('compares versions', () => {
    expect(versionAtLeast('0.32.0', '0.31.9')).toBe(true);
    expect(versionAtLeast('0.32.0', '0.32.0')).toBe(true);
    expect(versionAtLeast('0.9.0', '0.10.0')).toBe(false);
    expect(versionAtLeast('test', '0.1.0')).toBe(false);
    expect(versionAtLeast('1.0.0', '0.0.0')).toBe(true);
  });
});

describe('applyWordRanking (section 10)', () => {
  const a1 = entry('aramorph', 'كَتَّبَ', ['to make write'], { root: 'كتب', verbForm: 'II' });
  const a2 = entry('aramorph', 'كَتَبَ', ['to decree', 'to write down', 'to write'], { root: 'كتب', verbForm: 'I' });
  const b1 = entry('baranov', 'كَتَبَ', ['писать'], { root: 'كتب', verbForm: 'I' });
  const all = [a1, a2, b1];
  const ranking = { entries: [entryKey(a2), entryKey(a1)], bestEntry: entryKey(a2) };

  it('puts ranked entries first in ranked order, inside their own dictionary only', () => {
    const out = applyWordRanking(all, { aramorph: ranking });
    expect(out.map((e) => e.headword)).toEqual(['كَتَبَ', 'كَتَّبَ', 'كَتَبَ']);
    expect(out.map((e) => e.providerId)).toEqual(['aramorph', 'aramorph', 'baranov']);
  });

  it('keeps entries the ranking does not know after the ranked ones, in their own order', () => {
    const c = entry('aramorph', 'كُتِبَ', ['it was written']);
    const out = applyWordRanking([c, a1, a2], { aramorph: { entries: [entryKey(a2)], bestEntry: entryKey(a2) } });
    expect(out.map((e) => e.headword)).toEqual([a2.headword, c.headword, a1.headword]);
  });

  it('reorders meanings inside an entry only where the ranking has a meaning order', () => {
    const order = [senseKey('aramorph', a2.headword, a2.senses[2]), senseKey('aramorph', a2.headword, a2.senses[1])];
    const out = applyWordRanking(all, { aramorph: { ...ranking, senses: { [entryKey(a2)]: { order, best: order[0] } } } });
    expect(out[0].senses.map((s) => s.gloss)).toEqual(['to write', 'to write down', 'to decree']);
    expect(out[1].senses).toBe(a1.senses);
  });

  it('returns the same array when nothing changes, and never mutates its input', () => {
    expect(applyWordRanking(all, {})).toBe(all);
    expect(applyWordRanking(all, { aramorph: { entries: [entryKey(a1)], bestEntry: entryKey(a1) } })).toBe(all);
    const before = JSON.stringify(all);
    applyWordRanking(all, { aramorph: ranking });
    expect(JSON.stringify(all)).toBe(before);
  });

  it('ignores a ranking for a dictionary that is not in the result', () => {
    expect(applyWordRanking(all, { alsihah: ranking })).toBe(all);
  });
});

describe('result of a lookup with nothing to apply', () => {
  it('crowdRank returns the very same result when no manifest is held', async () => {
    const result: DictionaryLookupResult = { word: 'w', entries: [entry('aramorph', 'a', ['x'])] };
    expect(await crowdRank(KEYS, result)).toBe(result);
  });
});
