import { describe, expect, it } from 'vitest';
import { accountIdFor, handleAccountDelete, handleLink, handleUnlink, verifyIdentityToken, type AppleConfig } from '../src/account';
import { aggregate } from '../src/aggregate';
import { handleAdmin } from '../src/admin';
import { getConfig, saveConfig } from '../src/config';
import { base64url, generateEd25519, randomBytes, sha256Hex, signEd25519, utf8 } from '../src/crypto';
import { handleRequest, type Services } from '../src/worker';
import { signedPayload } from '../src/protocol';
import { freshServer, NOW, type TestServer } from './helpers';
import { k, seedInstall, seedReaders, seedVote, testSigner } from './seed';

async function appleKit() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' } as JsonWebKey;
  const cfg: AppleConfig = { audience: 'app.example.reader', serverSecret: new TextEncoder().encode('x'.repeat(40)), jwks: async () => [jwk] };
  const token = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'test-kid' }) => {
    const part = (o: unknown) => base64url(utf8(JSON.stringify(o)));
    const signing = `${part(header)}.${part(claims)}`;
    return `${signing}.${base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, utf8(signing))))}`;
  };
  return { cfg, token };
}

const claims = (over: Record<string, unknown> = {}) => ({ iss: 'https://appleid.apple.com', aud: 'app.example.reader', sub: 'apple-user-1', exp: Math.floor(NOW / 1000) + 3600, nonce: 'the-nonce-0001', ...over });

/** A registered install that can sign requests for the account endpoints. */
async function install(s: TestServer) {
  const pair = await generateEd25519();
  const { installIdFromPublicKey } = await import('../src/crypto');
  const installId = await installIdFromPublicKey(pair.publicKeyRaw);
  await s.db.run(`INSERT INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay) VALUES (?, ?, 'x', '2026-01-01', '2026-10-06')`, [installId, base64url(pair.publicKeyRaw)]);
  const request = async (fields: Record<string, string>) => {
    const req: Record<string, string> = { installId, nonce: base64url(randomBytes(16)), sentAt: new Date(s.clock.now).toISOString(), ...fields };
    req.sig = await signEd25519(pair.privateKey, signedPayload(req as never));
    return JSON.stringify(req);
  };
  return { installId, request };
}

describe('Apple identity tokens', () => {
  it('accepts a correct token, with the nonce as given or as its SHA-256', async () => {
    const { cfg, token } = await appleKit();
    expect(await verifyIdentityToken(await token(claims()), 'the-nonce-0001', cfg, NOW)).toEqual({ sub: 'apple-user-1' });
    expect(await verifyIdentityToken(await token(claims({ nonce: await sha256Hex('the-nonce-0001') })), 'the-nonce-0001', cfg, NOW)).toEqual({ sub: 'apple-user-1' });
  });

  it('rejects a wrong issuer, audience, nonce, expiry, algorithm, key id or signature', async () => {
    const { cfg, token } = await appleKit();
    for (const bad of [claims({ iss: 'https://evil.example' }), claims({ aud: 'other.app' }), claims({ nonce: 'other' }), claims({ exp: Math.floor(NOW / 1000) - 1 }), claims({ sub: undefined })])
      expect(await verifyIdentityToken(await token(bad), 'the-nonce-0001', cfg, NOW)).toBeNull();
    expect(await verifyIdentityToken(await token(claims(), { alg: 'none', kid: 'test-kid' }), 'the-nonce-0001', cfg, NOW)).toBeNull();
    expect(await verifyIdentityToken(await token(claims(), { alg: 'RS256', kid: 'unknown' }), 'the-nonce-0001', cfg, NOW)).toBeNull();
    const good = await token(claims());
    expect(await verifyIdentityToken(good.slice(0, -4) + 'AAAA', 'the-nonce-0001', cfg, NOW)).toBeNull();
    expect(await verifyIdentityToken('not.a.token', 'x', cfg, NOW)).toBeNull();
  });
});

describe('linking, unlinking and deleting an account (section 8.7)', () => {
  it('links an install after checking the token, stores only a hash of the Apple id, and raises its tier', async () => {
    const s = await freshServer();
    const { cfg, token } = await appleKit();
    const a = await install(s);
    const body = await a.request({ identityToken: await token(claims()) , nonce: 'the-nonce-0001' } as never);
    // The nonce is part of the signed request, so it must be the one the token carries.
    const req = JSON.parse(body);
    expect((await handleLink(s.deps(), cfg, JSON.stringify(req))).status).toBe(204);
    const row = (await s.db.get<{ accountId: string; tier: number }>(`SELECT accountId, tier FROM installs`))!;
    expect(row.tier).toBe(1);
    expect(row.accountId).toBe(await accountIdFor(cfg, 'apple-user-1'));
    expect(row.accountId).not.toContain('apple-user-1');
  });

  it('refuses a bad token, a token minted for a different request, an unsigned request and an unknown install', async () => {
    const s = await freshServer();
    const { cfg, token } = await appleKit();
    const a = await install(s);
    const bad = JSON.parse(await a.request({ identityToken: await token(claims({ aud: 'x' })), nonce: 'the-nonce-0001' }));
    expect((await handleLink(s.deps(), cfg, JSON.stringify(bad))).status).toBe(401);
    const forged = JSON.parse(await a.request({ identityToken: await token(claims()), nonce: 'the-nonce-0001' }));
    forged.identityToken = await token(claims({ sub: 'someone-else' }));
    expect((await handleLink(s.deps(), cfg, JSON.stringify(forged))).status).toBe(401);
    expect((await handleLink(s.deps(), cfg, JSON.stringify({ ...forged, installId: k('nobody') }))).status).toBe(404);
    expect((await handleLink(s.deps(), cfg, '{}')).status).toBe(400);
    expect(await s.db.get(`SELECT accountId FROM installs WHERE accountId IS NOT NULL`)).toBeUndefined();
  });

  it('unlinking returns the install to anonymous weight but a curator keeps their tier', async () => {
    const s = await freshServer();
    const { cfg, token } = await appleKit();
    const a = await install(s);
    await handleLink(s.deps(), cfg, await a.request({ identityToken: await token(claims()), nonce: 'the-nonce-0001' }));
    expect((await handleUnlink(s.deps(), await a.request({}))).status).toBe(204);
    expect(await s.db.get(`SELECT accountId, tier FROM installs`)).toEqual({ accountId: null, tier: 0 });
    await s.db.run(`UPDATE installs SET tier = 3`);
    await handleUnlink(s.deps(), await a.request({}));
    expect((await s.db.get<{ tier: number }>(`SELECT tier FROM installs`))!.tier).toBe(3);
  });

  it('deleting the account removes the votes of every linked install, including ones whose key is lost', async () => {
    const s = await freshServer();
    const { cfg, token } = await appleKit();
    const a = await install(s);
    const lost = await seedInstall(s.db, 'lostdevice');
    await seedVote(s.db, { installId: lost, entry: 'x' });
    await handleLink(s.deps(), cfg, await a.request({ identityToken: await token(claims()), nonce: 'the-nonce-0001' }));
    await s.db.run(`UPDATE installs SET accountId = (SELECT accountId FROM installs WHERE installId = ?) WHERE installId = ?`, [a.installId, lost]);
    const other = await seedInstall(s.db, 'someoneelse');
    await seedVote(s.db, { installId: other, entry: 'y' });
    expect((await handleAccountDelete(s.deps(), await a.request({}))).status).toBe(204);
    expect(await s.db.all(`SELECT installId FROM installs`)).toEqual([{ installId: other }]);
    expect(await s.db.all(`SELECT entryKey FROM votes`)).toHaveLength(1);
    expect((await s.db.all(`SELECT installId FROM deletions`)).length).toBe(2);
  });
});

describe('aggregation with accounts and tiers (section 8.7)', () => {
  it('a signed-in reader counts once however many devices they use', async () => {
    const s = await freshServer();
    await seedReaders(s.db, 31, () => ['a'], { prefix: 'anon' });
    // One person with three devices, each voting for "b".
    const acct = 'acct-hash-aaaaaaaaaaaa';
    for (const id of ['devone', 'devtwo', 'devthree']) {
      const installId = await seedInstall(s.db, id);
      await s.db.run(`UPDATE installs SET accountId = ? WHERE installId = ?`, [acct, installId]);
      await seedVote(s.db, { installId, entry: 'b' });
      await seedVote(s.db, { installId, book: 'otherbook', lemma: 'fillerwordacct', entry: 'filler' });
    }
    const { stats } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const st = stats.find((x) => x.lemmaKey === k('lemma1'))!;
    expect(st.installs).toBe(32); // 31 anonymous readers plus one person, not three
    expect(st.picks).toBeCloseTo(32, 5);
  });

  it('with tiers on, anonymous readers weigh 0.3, signed-in readers 1, and a curator up to 3', async () => {
    const s = await freshServer();
    await saveConfig(s.db, { trustTiers: true, thresholds: { ...(await getConfig(s.db)).thresholds, minPicks: 1, minInstalls: 1 } });
    const anon = await seedInstall(s.db, 'anon1');
    const signed = await seedInstall(s.db, 'signed1', { tier: 1 });
    const curator = await seedInstall(s.db, 'curator1', { tier: 3 });
    for (const [id, entry] of [[anon, 'a'], [signed, 'b'], [curator, 'c']] as const) {
      await seedVote(s.db, { installId: id, entry });
      await seedVote(s.db, { installId: id, book: 'otherbook', lemma: 'fillerword' + id, entry: 'filler' });
    }
    const { files } = await aggregate(s.db, s.clock.now, await getConfig(s.db));
    const shard = JSON.parse(files[`packs/v1/pooled/${k('lemma1').slice(0, 2)}.json`]).words[k('lemma1')].aramorph;
    expect(shard.entries).toEqual([k('c'), k('b'), k('a')]);
  });

  it('the admin can set a tier, and only 0 to 3', async () => {
    const s = await freshServer();
    const signer = await testSigner();
    const deps = { db: s.db, storage: s.storage, signer, now: () => s.clock.now, adminToken: 'x'.repeat(20) };
    const id = await seedInstall(s.db, 'tierme');
    const call = (body: unknown) => handleAdmin(deps, 'POST', '/tier', 'Bearer ' + 'x'.repeat(20), JSON.stringify(body));
    expect((await call({ installId: id, tier: 3 })).status).toBe(200);
    expect((await s.db.get<{ tier: number }>(`SELECT tier FROM installs`))!.tier).toBe(3);
    expect((await call({ installId: id, tier: 9 })).status).toBe(400);
  });
});

describe('account routes in the Worker', () => {
  it('are not there until Apple sign in is configured', async () => {
    const s = await freshServer();
    const signer = await testSigner();
    const services: Services = { db: s.db, storage: s.storage, signer, now: () => s.clock.now };
    const res = await handleRequest(new Request('https://crowd.test/v1/account/link', { method: 'POST', body: '{}' }), services);
    expect(res.status).toBe(404);
    const { cfg } = await appleKit();
    const res2 = await handleRequest(new Request('https://crowd.test/v1/account/link', { method: 'POST', body: '{}' }), { ...services, apple: cfg });
    expect(res2.status).toBe(400);
  });
});
