import { describe, expect, it } from 'vitest';
import { handleAdmin } from '../src/admin';
import { getConfig, saveConfig } from '../src/config';
import { verifyEd25519 } from '../src/crypto';
import { maintain, publish, rollback, type PublishDeps } from '../src/publish';
import { manifestPayload, type Manifest } from '../src/aggregate';
import { freshServer, type TestServer } from './helpers';
import { k, letters, seedInstall, seedReaders, seedVote, testSigner } from './seed';

async function setup() {
  const s = await freshServer();
  const signer = await testSigner();
  const deps: PublishDeps = { db: s.db, storage: s.storage, signer, now: () => s.clock.now };
  return { s, signer, deps };
}
const manifest = async (s: TestServer): Promise<Manifest> => JSON.parse((await s.storage.get('manifest.json'))!);
const DAY = 86_400_000;

describe('publish', () => {
  it('writes signed files and a manifest whose sequence only goes up', async () => {
    const { s, signer, deps } = await setup();
    await seedReaders(s.db, 32, () => ['a']);
    const one = await publish(deps);
    const m1 = await manifest(s);
    expect(m1.sequence).toBe(one.sequence);
    expect(await verifyEd25519(signer.publicKeyRaw, m1.signature!, manifestPayload(m1))).toBe(true);
    for (const [name, hash] of Object.entries(m1.packs)) {
      expect(hash).toMatch(/^sha256-/);
      expect(await s.storage.get(`packs/v1/${name}.json`)).not.toBeNull();
    }
    const two = await publish(deps);
    expect(two.sequence).toBeGreaterThan(one.sequence);
  });

  it('removes public files that are no longer ranked, but keeps them in the snapshot', async () => {
    const { s, deps } = await setup();
    await seedReaders(s.db, 32, () => ['a']);
    const first = await publish(deps);
    expect((await s.storage.list('packs/v1/')).length).toBeGreaterThan(0);
    await s.db.run(`DELETE FROM votes`);
    await publish(deps);
    expect(await s.storage.list('packs/v1/')).toEqual([]);
    expect((await s.storage.list(`snapshots/${first.snapshotId}/packs/v1/`)).length).toBeGreaterThan(0);
  });

  it('the kill switch publishes a manifest with enabled false straight away', async () => {
    const { s, deps } = await setup();
    const token = 'x'.repeat(20);
    const res = await handleAdmin({ ...deps, adminToken: token }, 'POST', '/kill', 'Bearer ' + token, JSON.stringify({ enabled: false }));
    expect(res.status).toBe(200);
    expect((await manifest(s)).enabled).toBe(false);
    expect((await getConfig(s.db)).enabled).toBe(false);
  });
});

describe('rollback (sections 8.6 and 12.1)', () => {
  it('republishes an earlier snapshot under a new, higher sequence when nothing was deleted or banned since', async () => {
    const { s, deps } = await setup();
    await seedReaders(s.db, 32, () => ['a']);
    const good = await publish(deps);
    const goodFiles = (await s.storage.list('packs/v1/')).length;
    await s.db.run(`DELETE FROM votes`); // a bad night: the votes are gone, so the next run publishes nothing
    await publish(deps);
    expect(await s.storage.list('packs/v1/')).toEqual([]);
    const back = await rollback(deps, good.snapshotId);
    expect(back.mode).toBe('republished');
    expect(back.sequence).toBeGreaterThan(good.sequence + 1);
    expect((await s.storage.list('packs/v1/')).length).toBe(goodFiles);
    expect((await manifest(s)).sequence).toBe(back.sequence);
  });

  it('aggregates again from the live votes when a deletion has happened since the snapshot', async () => {
    const { s, deps } = await setup();
    const ids = await seedReaders(s.db, 32, () => ['a']);
    const snap = await publish(deps);
    s.clock.now += DAY;
    await s.db.batch([
      { sql: `DELETE FROM votes WHERE installId = ?`, params: [ids[0]] },
      { sql: `DELETE FROM installs WHERE installId = ?`, params: [ids[0]] },
      { sql: `INSERT INTO deletions (installId, deletedAt) VALUES (?, '2026-10-07')`, params: [ids[0]] },
    ]);
    const back = await rollback(deps, snap.snapshotId);
    expect(back.mode).toBe('reaggregated');
  });

  it('reaggregates when an install was banned since the snapshot, and keeps the kill switch as it is now', async () => {
    const { s, deps } = await setup();
    const ids = await seedReaders(s.db, 32, () => ['a']);
    const snap = await publish(deps);
    await s.db.run(`UPDATE installs SET banned = 1 WHERE installId = ?`, [ids[1]]);
    await saveConfig(s.db, { enabled: false });
    const back = await rollback(deps, snap.snapshotId);
    expect(back.mode).toBe('reaggregated');
    expect((await manifest(s)).enabled).toBe(false);
  });

  it('refuses an unknown snapshot', async () => {
    const { deps } = await setup();
    await expect(rollback(deps, 999)).rejects.toThrow();
  });
});

describe('alerts (section 14)', () => {
  it('flags a best entry that changed between two runs and a one-day vote spike', async () => {
    const { s, deps } = await setup();
    await seedReaders(s.db, 32, () => ['a']);
    await publish(deps);
    await s.db.run(`UPDATE votes SET entryKey = ? WHERE entryKey = ?`, [k('b'), k('a')]);
    const second = await publish(deps);
    expect(second.alerts.some((a) => a.startsWith('best entry changed'))).toBe(true);

    const spike = await setup();
    await seedReaders(spike.s.db, 32, () => ['a'], { lemma: 'quiet' });
    await spike.s.db.run(`UPDATE votes SET appliedAt = 0`);
    const small = await seedInstall(spike.s.db, 'small');
    for (let w = 0; w < 4; w++) for (let e = 0; e < 2; e++) await seedVote(spike.s.db, { installId: small, lemma: 'calm' + letters(w), entry: 'c' + letters(e) + 'z', appliedAt: spike.s.clock.now - 1000 });
    const burst = await seedInstall(spike.s.db, 'burst');
    for (let i = 0; i < 30; i++) await seedVote(spike.s.db, { installId: burst, lemma: 'noisy', entry: 'e' + letters(i) + 'z', appliedAt: spike.s.clock.now - 1000 });
    expect((await publish(spike.deps)).alerts.some((a) => a.startsWith('vote spike'))).toBe(true);
  });
});

describe('maintenance (sections 7.4, 12, 14)', () => {
  it('purges old tombstones, ledger rows, idle installs, nonces and old snapshots, and keeps live data', async () => {
    const { s, deps } = await setup();
    const [fresh] = await seedReaders(s.db, 2, () => ['a']);
    const idle = await seedInstall(s.db, 'idle', { lastSeenDay: '2025-01-01' });
    await seedVote(s.db, { installId: idle, entry: 'x' });
    await seedVote(s.db, { installId: fresh, entry: 'old', saved: false, appliedAt: s.clock.now - 31 * DAY });
    await seedVote(s.db, { installId: fresh, entry: 'recent', saved: false, appliedAt: s.clock.now - 2 * DAY });
    await s.db.run(`INSERT INTO deletions (installId, deletedAt) VALUES ('aaaaaaaaaaaa', '2026-08-01'), ('bbbbbbbbbbbb', '2026-10-01')`);
    await s.db.run(`INSERT INTO nonces (nonce, expiresAt) VALUES ('old', ?), ('new', ?)`, [s.clock.now - 1, s.clock.now + 1000]);
    await s.storage.put('snapshots/1/manifest.json', '{}');
    await s.db.run(`INSERT INTO snapshots (id, createdAt, sequence, manifestSha, note) VALUES (1, ?, 1, 'x', '{}')`, [s.clock.now - 31 * DAY]);
    const out = await maintain(deps);
    expect(out).toEqual({ tombstones: 1, installs: 1, snapshots: 1 });
    expect((await s.db.all<{ installId: string }>(`SELECT installId FROM deletions`)).map((r) => r.installId)).toEqual(['bbbbbbbbbbbb']);
    expect((await s.db.all(`SELECT nonce FROM nonces`)).length).toBe(1);
    expect(await s.storage.list('snapshots/1/')).toEqual([]);
    expect(await s.db.get(`SELECT 1 AS x FROM installs WHERE installId = ?`, [idle])).toBeUndefined();
    expect(await s.db.get(`SELECT 1 AS x FROM votes WHERE entryKey = ?`, [k('recent')])).toBeDefined();
  });
});

describe('admin endpoints (section 14)', () => {
  const TOKEN = 'a-long-admin-token-123';
  const call = async (d: Awaited<ReturnType<typeof setup>>, method: string, path: string, body?: unknown, token = TOKEN) =>
    handleAdmin({ ...d.deps, adminToken: TOKEN }, method, path, token ? 'Bearer ' + token : null, body ? JSON.stringify(body) : '');

  it('is closed without the right token, and when no token is set', async () => {
    const d = await setup();
    expect((await call(d, 'GET', '/summary', undefined, 'wrong-token-wrong-token')).status).toBe(401);
    expect((await call(d, 'GET', '/summary', undefined, '')).status).toBe(401);
    expect((await handleAdmin({ ...d.deps, adminToken: undefined }, 'GET', '/summary', 'Bearer x', '')).status).toBe(401);
    expect((await handleAdmin({ ...d.deps, adminToken: 'short' }, 'GET', '/summary', 'Bearer short', '')).status).toBe(401);
  });

  it('shows a summary and the word table, bans and un-bans, denies, and changes thresholds', async () => {
    const d = await setup();
    const ids = await seedReaders(d.s.db, 32, () => ['a']);
    const summary = (await call(d, 'GET', '/summary')).json as { installs: number; votes: number };
    expect(summary.installs).toBe(32);
    const words = (await call(d, 'GET', '/words')).json as { words: { status: string }[] };
    expect(words.words.some((w) => w.status === 'applied')).toBe(true);
    await call(d, 'POST', '/ban', { installId: ids[0] });
    expect((await d.s.db.get<{ banned: number }>(`SELECT banned FROM installs WHERE installId = ?`, [ids[0]]))!.banned).toBe(1);
    await call(d, 'POST', '/unban', { installId: ids[0] });
    expect((await d.s.db.get<{ banned: number }>(`SELECT banned FROM installs WHERE installId = ?`, [ids[0]]))!.banned).toBe(0);
    expect((await call(d, 'POST', '/deny', { lemmaKeys: [k('lemma1'), 5] })).json).toEqual({ bookKeys: [], lemmaKeys: [k('lemma1')] });
    expect(((await call(d, 'POST', '/thresholds', { minPicks: 50, bogus: 1 })).json as { minPicks: number }).minPicks).toBe(50);
    expect((await call(d, 'POST', '/aggregate')).status).toBe(200);
    expect(((await call(d, 'GET', '/snapshots')).json as unknown[]).length).toBe(1);
    expect((await call(d, 'GET', '/nope')).status).toBe(404);
    expect((await call(d, 'POST', '/rollback', { id: 'x' })).status).toBe(400);
    expect((await call(d, 'POST', '/rollback', { id: 12345 })).status).toBe(404);
  });
});
