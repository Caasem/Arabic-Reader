import { migrate, MemoryStorage } from '../src/db';
import { base64url, generateEd25519, hmacSha256, installIdFromPublicKey, randomBytes, recoveryVerifier, signEd25519 } from '../src/crypto';
import { handleDelete, handleVotes, type AllowList, type Reply } from '../src/ingest';
import { signedPayload, utcDay, type VoteItem, type VotesRequest, type VotesResponse } from '../src/protocol';
import { openNodeDb } from '../src/nodeDb';

export const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);

export async function freshServer(now = NOW) {
  const db = openNodeDb();
  await migrate(db);
  const clock = { now };
  const storage = new MemoryStorage();
  return { db, storage, clock, deps: (ip = '1.1.1.1', allowList?: AllowList) => ({ db, now: () => clock.now, ip, allowList }) };
}
export type TestServer = Awaited<ReturnType<typeof freshServer>>;

const key = (s: string): string => s.toLowerCase().replace(/[^a-z2-7]/g, 'a').padEnd(12, 'a').slice(0, 20);

export const item = (over: Partial<VoteItem> = {}): VoteItem => ({
  bookKey: key('book'),
  lemmaKey: key('lemma'),
  providerId: 'aramorph',
  entryKey: key('entry1'),
  senseKey: null,
  source: 'entry',
  pos: 1,
  rev: 1,
  action: 'save',
  day: utcDay(NOW),
  ...over,
});

/** A fake app install: it owns a key pair and builds correctly signed requests. */
export async function newInstall() {
  const pair = await generateEd25519();
  const installId = await installIdFromPublicKey(pair.publicKeyRaw);
  const publicKey = base64url(pair.publicKeyRaw);
  let recoveryCode = '';
  return {
    installId,
    publicKey,
    get recoveryCode() {
      return recoveryCode;
    },
    async votes(server: TestServer, items: VoteItem[], opts: { register?: boolean; ip?: string; sentAt?: number; nonce?: string; tamper?: boolean; allow?: AllowList } = {}): Promise<Reply> {
      const req: VotesRequest = {
        installId,
        ...(opts.register === false ? {} : { publicKey }),
        nonce: opts.nonce ?? base64url(randomBytes(16)),
        seq: Math.max(0, ...items.map((i) => i.rev)),
        sentAt: new Date(opts.sentAt ?? server.clock.now).toISOString(),
        appVersion: '0.32.0',
        items,
        sig: '',
      };
      req.sig = await signEd25519(pair.privateKey, signedPayload(req));
      if (opts.tamper) req.items = [...req.items, item({ rev: 99 })].slice(0, req.items.length);
      if (opts.tamper) req.appVersion = '9.9.9';
      const reply = await handleVotes(server.deps(opts.ip, opts.allow), JSON.stringify(req));
      const body = reply.body as VotesResponse | undefined;
      if (body && 'recoveryCode' in body && body.recoveryCode) recoveryCode = body.recoveryCode;
      return reply;
    },
    async delete(server: TestServer, how: 'sig' | 'proof' = 'sig', opts: { ip?: string; code?: string; target?: string } = {}): Promise<Reply> {
      const req = { installId: opts.target ?? installId, nonce: base64url(randomBytes(16)), sentAt: new Date(server.clock.now).toISOString() } as Record<string, string>;
      const payload = signedPayload(req as never);
      if (how === 'sig') req.sig = await signEd25519(pair.privateKey, payload);
      else req.proof = await hmacSha256(await recoveryVerifier(opts.code ?? recoveryCode), payload);
      return handleDelete(server.deps(opts.ip), JSON.stringify(req));
    },
  };
}
export type TestInstall = Awaited<ReturnType<typeof newInstall>>;
