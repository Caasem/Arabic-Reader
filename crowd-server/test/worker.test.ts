import { describe, expect, it } from 'vitest';
import { handleRequest, runNightly, type Services } from '../src/worker';
import { base64url, randomBytes, signEd25519 } from '../src/crypto';
import { signedPayload, type VotesRequest, type VotesResponse } from '../src/protocol';
import { freshServer, item, NOW } from './helpers';
import { seedReaders, testSigner } from './seed';
import { generateEd25519, installIdFromPublicKey } from '../src/crypto';

const TOKEN = 'worker-admin-token-123';

async function setup() {
  const s = await freshServer();
  const signer = await testSigner();
  const services: Services = { db: s.db, storage: s.storage, signer, now: () => s.clock.now, adminToken: TOKEN };
  const call = (path: string, init: RequestInit = {}) => handleRequest(new Request('https://crowd.test' + path, init), services);
  return { s, services, call };
}

async function signedVotes(): Promise<string> {
  const pair = await generateEd25519();
  const req: VotesRequest = {
    installId: await installIdFromPublicKey(pair.publicKeyRaw),
    publicKey: base64url(pair.publicKeyRaw),
    nonce: base64url(randomBytes(16)),
    seq: 1,
    sentAt: new Date(NOW).toISOString(),
    appVersion: '0.32.0',
    items: [item()],
    sig: '',
  };
  req.sig = await signEd25519(pair.privateKey, signedPayload(req));
  return JSON.stringify(req);
}

describe('routes', () => {
  it('answers health and preflight with CORS, and refuses unknown routes', async () => {
    const { call } = await setup();
    expect((await call('/health')).status).toBe(200);
    const pre = await call('/v1/votes', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect((await call('/nope')).status).toBe(404);
    expect((await call('/v1/votes')).status).toBe(404); // GET is not allowed
  });

  it('takes votes over HTTP and returns the results with CORS', async () => {
    const { call } = await setup();
    const res = await call('/v1/votes', { method: 'POST', body: await signedVotes(), headers: { 'cf-connecting-ip': '5.5.5.5' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as VotesResponse;
    expect(body.results).toEqual([{ status: 'applied' }]);
    expect(body.recoveryCode).toBeTruthy();
  });

  it('returns an error body and status for a bad request, and nothing internal', async () => {
    const { call } = await setup();
    const res = await call('/v1/votes', { method: 'POST', body: '{bad' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_json' });
  });

  it('serves the manifest and packs with an ETag and a one-hour cache, and 304 when unchanged', async () => {
    const { call, s, services } = await setup();
    expect((await call('/manifest.json')).status).toBe(404);
    await seedReaders(s.db, 32, () => ['a']);
    await runNightly(services);
    const res = await call('/manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    const etag = res.headers.get('etag')!;
    expect((await call('/manifest.json', { headers: { 'if-none-match': etag } })).status).toBe(304);
    const manifest = (await res.json()) as { packs: Record<string, string> };
    const [name] = Object.keys(manifest.packs);
    expect((await call(`/packs/v1/${name}.json`)).status).toBe(200);
    expect((await call('/packs/v1/pooled/..%2Fsecret.json')).status).toBe(404);
    expect((await call('/packs/v1/other/aa.json')).status).toBe(404);
    expect((await call('/snapshots/1/manifest.json')).status).toBe(404); // snapshots are private
  });

  it('protects the admin routes with the token', async () => {
    const { call } = await setup();
    expect((await call('/v1/admin/summary')).status).toBe(401);
    const ok = await call('/v1/admin/summary', { headers: { authorization: 'Bearer ' + TOKEN } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('uses a stricter allow-list when one has been published', async () => {
    const { call, s } = await setup();
    await s.storage.put('allowlist.json', JSON.stringify({ entries: ['aramorph:zzzzzzzzzzzz'] }));
    const res = await call('/v1/votes', { method: 'POST', body: await signedVotes() });
    expect(((await res.json()) as VotesResponse).results).toEqual([{ status: 'rejected', code: 'unknown_entry' }]);
  });
});
