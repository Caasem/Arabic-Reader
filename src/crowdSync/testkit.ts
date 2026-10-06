import { base64url, generateEd25519, signEd25519 } from '../../crowd-server/src/crypto';
import { migrate, MemoryStorage, type Db } from '../../crowd-server/src/db';
import { openNodeDb } from '../../crowd-server/src/nodeDb';
import { publish, type Signer } from '../../crowd-server/src/publish';
import { handleRequest, type Services } from '../../crowd-server/src/worker';
import { db } from '../persistence/schema';
import { configureConsent } from './consent';

/** An in-process crowd service and a `fetch` that talks to it, for tests of the app side. */
export async function startService(adminToken = 'testkit-admin-token-123') {
  const sqlite = openNodeDb();
  await migrate(sqlite);
  const pair = await generateEd25519();
  const signer: Signer = { sign: (m) => signEd25519(pair.privateKey, m) };
  const clock = { now: Date.now() };
  const storage = new MemoryStorage();
  const services: Services = { db: sqlite, storage, signer, now: () => clock.now, adminToken };
  const calls: { url: string; method: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET' });
    return handleRequest(new Request(url, init), services);
  };
  return {
    db: sqlite as Db,
    services,
    storage,
    clock,
    fetchImpl,
    calls,
    publicKey: base64url(pair.publicKeyRaw),
    publish: () => publish(services),
  };
}

export type TestService = Awaited<ReturnType<typeof startService>>;

export const API = 'https://crowd.test';

export function setSharing(on: boolean, apiBase = API): void {
  configureConsent({ isSharingOn: () => on, apiBase });
}

export async function resetLocal(): Promise<void> {
  await Promise.all([db.crowdState.clear(), db.crowdQueue.clear(), db.crowdPacks.clear(), db.sensePicks.clear()]);
}

/** An old install with a vote per entry, so it counts at full weight on the server (docs section 8.1). */
export async function seedServerReader(
  sqlite: Db,
  id: string,
  votes: { bookKey: string; lemmaKey: string; providerId: string; entryKey: string; pos?: number }[],
  filler: { bookKey: string; lemmaKey: string; entryKey: string },
): Promise<void> {
  await sqlite.run(`INSERT INTO installs (installId, publicKey, recoveryVerifier, firstSeenDay, lastSeenDay) VALUES (?, 'x', 'x', '2026-01-01', '2026-10-06')`, [id]);
  const all = [...votes.map((v) => ({ ...v, pos: v.pos ?? 2 })), { bookKey: filler.bookKey, lemmaKey: filler.lemmaKey, providerId: 'aramorph', entryKey: filler.entryKey, pos: 2 }];
  for (const [n, v] of all.entries()) {
    await sqlite.run(
      `INSERT INTO votes (installId, bookKey, lemmaKey, providerId, entryKey, senseKey, source, pos, saved, rev, form, day, appliedAt) VALUES (?, ?, ?, ?, ?, NULL, 'entry', ?, 1, ?, NULL, '2026-10-05', ?)`,
      [id, n === all.length - 1 ? 'otherbookotherbookaa' : v.bookKey, v.lemmaKey, v.providerId, v.entryKey, v.pos, n + 1, Date.now()],
    );
  }
}
