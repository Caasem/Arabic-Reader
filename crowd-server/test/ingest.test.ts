import { describe, expect, it } from 'vitest';
import { saveConfig } from '../src/config';
import { SetAllowList } from '../src/ingest';
import { LIMITS, canonicalJson, utcDay, type VotesResponse } from '../src/protocol';
import { freshServer, item, newInstall, NOW } from './helpers';

const body = (r: { body?: unknown }) => r.body as VotesResponse;
const votes = async (s: Awaited<ReturnType<typeof freshServer>>) => s.db.all<{ rev: number; saved: number; entryKey: string; installId: string }>(`SELECT * FROM votes ORDER BY entryKey`);

describe('canonical JSON', () => {
  it('sorts keys and drops undefined so both sides sign the same bytes', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: undefined, b: 2 }] })).toBe('{"a":[{"b":2,"d":1}],"b":1}');
  });
});

describe('registering and recording votes', () => {
  it('registers a new install on its first signed request and returns a recovery code once', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const r = await a.votes(s, [item()]);
    expect(r.status).toBe(200);
    expect(body(r).results).toEqual([{ status: 'applied' }]);
    expect(body(r).maxRev).toBe(1);
    expect(body(r).recoveryCode).toMatch(/^[a-z2-7]{26}$/);
    const r2 = await a.votes(s, [item({ rev: 2 })], { register: false });
    expect(body(r2).recoveryCode).toBeUndefined();
    expect(await s.db.all(`SELECT installId FROM installs`)).toHaveLength(1);
  });

  it('does not store the recovery code, only a verifier', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()]);
    const row = (await s.db.get<{ recoveryVerifier: string }>(`SELECT recoveryVerifier FROM installs`))!;
    expect(row.recoveryVerifier).not.toContain(a.recoveryCode);
  });

  it('refuses an unknown install that does not send its key', async () => {
    const s = await freshServer();
    const a = await newInstall();
    expect((await a.votes(s, [item()], { register: false })).body).toEqual({ error: 'unknown_install' });
  });

  it('refuses an install id that does not belong to the key', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const b = await newInstall();
    const req = { installId: a.installId, publicKey: b.publicKey, nonce: 'aaaaaaaaaaaa', seq: 1, sentAt: new Date(NOW).toISOString(), appVersion: '1', items: [], sig: 'x'.repeat(20) };
    const { handleVotes } = await import('../src/ingest');
    expect((await handleVotes(s.deps(), JSON.stringify(req))).body).toEqual({ error: 'bad_install_id' });
  });

  it('rejects a bad signature, even when only one field was changed', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const r = await a.votes(s, [item()], { tamper: true });
    expect(r.status).toBe(401);
    expect(await votes(s)).toHaveLength(0);
  });

  it('rejects malformed requests and oversized bodies', async () => {
    const s = await freshServer();
    const { handleVotes } = await import('../src/ingest');
    expect((await handleVotes(s.deps(), '{nope')).body).toEqual({ error: 'bad_json' });
    expect((await handleVotes(s.deps(), '{"installId":1}')).body).toEqual({ error: 'bad_schema' });
    expect((await handleVotes(s.deps(), ' '.repeat(LIMITS.maxBodyBytes + 1))).status).toBe(413);
    const a = await newInstall();
    expect((await a.votes(s, [item({ pos: -1 })])).body).toEqual({ error: 'bad_schema' });
  });

  it('rejects a request whose clock is more than ten minutes off', async () => {
    const s = await freshServer();
    const a = await newInstall();
    expect((await a.votes(s, [item()], { sentAt: NOW - 11 * 60_000 })).body).toEqual({ error: 'bad_time' });
    expect((await a.votes(s, [item()], { sentAt: NOW + 9 * 60_000 })).status).toBe(200);
  });

  it('rejects a replayed request', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()], { nonce: 'sameNonce-0001' });
    expect((await a.votes(s, [item({ rev: 2 })], { nonce: 'sameNonce-0001', register: false })).body).toEqual({ error: 'replayed' });
  });
});

describe('vote ordering (section 7.4)', () => {
  it('applies a higher revision and ignores an equal or lower one as stale', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item({ rev: 5 })]);
    const r = await a.votes(s, [item({ rev: 5 }), item({ rev: 3, action: 'unsave' })], { register: false });
    expect(body(r).results).toEqual([{ status: 'stale' }, { status: 'stale' }]);
    expect((await votes(s))[0]).toMatchObject({ rev: 5, saved: 1 });
  });

  it('an old queued save cannot overwrite a newer un-save, in either order of arrival', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item({ rev: 4, action: 'unsave' })]);
    const late = await a.votes(s, [item({ rev: 3, action: 'save' })], { register: false });
    expect(body(late).results).toEqual([{ status: 'stale' }]);
    expect((await votes(s))[0]).toMatchObject({ rev: 4, saved: 0 });
  });

  it('the newest of two changes in one request wins whatever their order in the list', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const r = await a.votes(s, [item({ rev: 7, action: 'unsave' }), item({ rev: 6, action: 'save' })]);
    expect(body(r).results).toEqual([{ status: 'applied' }, { status: 'applied' }]);
    expect((await votes(s))[0]).toMatchObject({ rev: 7, saved: 0 });
  });

  it('a pending item for a key the server never saw is applied even when its rev is below maxRev', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item({ entryKey: 'aaaaaaaaaaaa', rev: 10 })]);
    const r = await a.votes(s, [item({ entryKey: 'bbbbbbbbbbbb', rev: 3 })], { register: false });
    expect(body(r).results).toEqual([{ status: 'applied' }]);
    expect(body(r).maxRev).toBe(10);
  });

  it('is idempotent: a retried request changes nothing', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item({ rev: 2 })]);
    const before = await votes(s);
    await a.votes(s, [item({ rev: 2 })], { register: false });
    expect(await votes(s)).toEqual(before);
  });

  it('rejects an item more than ten thousand revisions above maxRev, and accepts one at the edge', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item({ rev: 1 })]);
    const r = await a.votes(s, [item({ entryKey: 'cccccccccccc', rev: 1 + LIMITS.revWindow }), item({ entryKey: 'dddddddddddd', rev: 2 + LIMITS.revWindow })], { register: false });
    expect(body(r).results).toEqual([{ status: 'applied' }, { status: 'rejected', code: 'rev_too_far' }]);
  });

  it('enforces the age limit on the server: 15 days is fine, 16 is too old, tomorrow is bad', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const day = (n: number) => utcDay(NOW - n * 86_400_000);
    const r = await a.votes(s, [
      item({ entryKey: 'aaaaaaaaaaaa', rev: 1, day: day(15) }),
      item({ entryKey: 'bbbbbbbbbbbb', rev: 2, day: day(16) }),
      item({ entryKey: 'cccccccccccc', rev: 3, day: day(-1) }),
    ]);
    expect(body(r).results).toEqual([{ status: 'applied' }, { status: 'rejected', code: 'too_old' }, { status: 'rejected', code: 'bad_item' }]);
  });

  it('a delayed save cannot land after the tombstone it was superseded by (tombstone kept longer than the age limit)', () => {
    expect(LIMITS.tombstoneDays).toBeGreaterThan(LIMITS.maxAgeDays);
  });
});

describe('allow-list and limits', () => {
  it('rejects an entry of an unknown dictionary and one outside a set allow-list', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const r = await a.votes(s, [item({ providerId: 'personal', rev: 1 })]);
    expect(body(r).results).toEqual([{ status: 'rejected', code: 'unknown_entry' }]);
    const strict = new SetAllowList(['aramorph:' + item().entryKey], ['aaaaaaaaaaaa:' + 'bbbbbbbbbbbb']);
    const r2 = await a.votes(s, [item({ rev: 2 }), item({ entryKey: 'zzzzzzzzzzzz', rev: 3 }), item({ rev: 4, senseKey: 'cccccccccccc', source: 'selection' })], { register: false, allow: strict });
    expect(body(r2).results).toEqual([{ status: 'applied' }, { status: 'rejected', code: 'unknown_entry' }, { status: 'rejected', code: 'unknown_sense' }]);
  });

  it('rate limits an install per hour', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()]);
    let last = 200;
    for (let i = 0; i < LIMITS.perInstallPerHour + 2; i++) last = (await a.votes(s, [], { register: false })).status;
    expect(last).toBe(429);
  });

  it('limits new installs per address per day', async () => {
    const s = await freshServer();
    let last = 200;
    for (let i = 0; i < LIMITS.registrationsPerAddressPerDay + 1; i++) last = (await (await newInstall()).votes(s, [item()], { ip: '9.9.9.9' })).status;
    expect(last).toBe(429);
    expect((await (await newInstall()).votes(s, [item()], { ip: '8.8.8.8' })).status).toBe(200);
  });

  it('refuses a banned install and honours the kill switch', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()]);
    await s.db.run(`UPDATE installs SET banned = 1`);
    expect((await a.votes(s, [item({ rev: 2 })], { register: false })).body).toEqual({ error: 'banned' });
    await s.db.run(`UPDATE installs SET banned = 0`);
    await saveConfig(s.db, { enabled: false });
    expect((await a.votes(s, [item({ rev: 2 })], { register: false })).body).toEqual({ error: 'disabled' });
  });
});

describe('deletion (sections 11 and 12.1)', () => {
  it('removes every vote and the install, and writes the ledger row', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item(), item({ entryKey: 'bbbbbbbbbbbb', rev: 2 })]);
    expect((await a.delete(s)).status).toBe(204);
    expect(await votes(s)).toEqual([]);
    expect(await s.db.all(`SELECT * FROM installs`)).toEqual([]);
    expect(await s.db.all(`SELECT installId FROM deletions`)).toEqual([{ installId: a.installId }]);
  });

  it('works with the recovery code when the key is gone, and not with a wrong code', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()]);
    expect((await a.delete(s, 'proof', { code: 'wrongcode' })).status).toBe(401);
    expect(await votes(s)).toHaveLength(1);
    expect((await a.delete(s, 'proof')).status).toBe(204);
    expect(await votes(s)).toHaveLength(0);
  });

  it('a deleted id can never be used again while its ledger row exists', async () => {
    const s = await freshServer();
    const a = await newInstall();
    await a.votes(s, [item()]);
    await a.delete(s);
    expect((await a.votes(s, [item({ rev: 9 })])).body).toEqual({ error: 'install_deleted' });
    expect(await votes(s)).toEqual([]);
  });

  it('deleting something already gone succeeds, so a retry is harmless', async () => {
    const s = await freshServer();
    const a = await newInstall();
    expect((await a.delete(s)).status).toBe(204);
  });

  it('rejects a deletion that is neither signed by the key nor proven by the recovery secret', async () => {
    const s = await freshServer();
    const a = await newInstall();
    const b = await newInstall();
    await a.votes(s, [item()]);
    expect((await b.delete(s, 'sig', { target: a.installId })).status).toBe(401);
    expect(await votes(s)).toHaveLength(1);
  });
});
