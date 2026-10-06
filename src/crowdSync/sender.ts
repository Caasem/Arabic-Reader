import { base64url, hmacSha256, randomBytes, recoveryVerifier, signEd25519 } from '../../crowd-server/src/crypto';
import { signedPayload, type DeleteRequest, type VotesRequest, type VotesResponse } from '../../crowd-server/src/protocol';
import { ConsentError, crowdFetch, isSharingOn } from './consent';
import { discardIdentity, ensureIdentity } from './identity';
import { clearQueue, dropExpired, nextBatch, removeFromQueue } from './queue';
import { loadState, updateState } from './state';

declare const __APP_VERSION__: string;
const appVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').slice(0, 24);

export type FlushStatus = 'off' | 'blocked' | 'empty' | 'sent' | 'offline' | 'error';
export interface FlushResult {
  status: FlushStatus;
  sent: number;
}

const POST = (body: string): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body });
const nonce = (): string => base64url(randomBytes(16));

/**
 * Sends the next batch of queued votes (docs/specs/crowd-sense-ranking.md, sections 7.4 and 11). Safe to call as
 * often as you like: with sharing off it does nothing, with an empty queue it sends nothing, and a failure leaves
 * the queue as it was. A pending vote keeps the revision it was queued with; the server decides what is stale.
 */
export async function flushQueue(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<FlushResult> {
  if (!isSharingOn()) return { status: 'off', sent: 0 };
  if ((await loadState()).blocked) return { status: 'blocked', sent: 0 };
  await dropExpired(now);
  const batch = await nextBatch();
  if (batch.length === 0) return { status: 'empty', sent: 0 };

  const state = await ensureIdentity();
  const request: VotesRequest = {
    installId: state.installId,
    ...(state.registered ? {} : { publicKey: state.keys.publicKey }),
    nonce: nonce(),
    seq: Math.max(...batch.map((r) => r.rev)),
    sentAt: new Date(now).toISOString(),
    appVersion: appVersion(),
    items: batch.map((r) => r.item),
    sig: '',
  };
  request.sig = await signEd25519(state.keys.privateKey, signedPayload(request));

  let response: Response;
  try {
    response = await crowdFetch('/v1/votes', POST(JSON.stringify(request)), fetchImpl);
  } catch (e) {
    return { status: e instanceof ConsentError ? 'off' : 'offline', sent: 0 };
  }

  if (response.status === 200) {
    const body = (await response.json()) as VotesResponse;
    // Every result is final: applied, stale or rejected (none of the rejections is retryable).
    await removeFromQueue(batch);
    await updateState((s) => {
      s.registered = true;
      s.maxRev = body.maxRev;
      // A device that fell behind the server (restored, or key reused) moves its counter up for NEW actions only.
      if (s.seq < body.maxRev) s.seq = body.maxRev;
      if (body.recoveryCode) s.recoveryCode = body.recoveryCode;
      s.lastFlushAt = now;
    });
    return { status: 'sent', sent: batch.length };
  }

  const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
  if (code === 'banned') {
    await updateState((s) => {
      s.blocked = true;
    });
    return { status: 'blocked', sent: 0 };
  }
  if (code === 'install_deleted') {
    // This id was deleted: start over with a new key and id, keep what is queued (section 12.1).
    const queued = await nextBatch();
    await discardIdentity();
    await updateState((s) => {
      s.seq = Math.max(0, ...queued.map((r) => r.rev));
    });
  }
  if (code === 'unknown_install') {
    await updateState((s) => {
      s.registered = false;
    });
  }
  return { status: 'error', sent: 0 };
}

export type DeleteStatus = 'deleted' | 'nothing' | 'offline' | 'refused';

/**
 * "Delete my shared saves" (section 12.1). Asks the server to remove every vote for this install, then discards the
 * key, recovery code, counters and queue, so a new key is made if sharing stays on. This is an explicit request by the
 * reader, so it is allowed even when sharing is switched off. With `recoveryCode` it works without the install key.
 */
export async function deleteShared(opts: { fetchImpl?: typeof fetch; recoveryCode?: string; installId?: string; now?: number } = {}): Promise<DeleteStatus> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const state = await loadState();
  const installId = state.installId ?? opts.installId;
  if (!installId || (!state.keys && !opts.recoveryCode)) {
    await clearQueue();
    await discardIdentity();
    return 'nothing';
  }
  if (!state.registered && !opts.recoveryCode) {
    // The server has never seen this install, so there is nothing there to delete.
    await clearQueue();
    await discardIdentity();
    return 'nothing';
  }
  const request: DeleteRequest = { installId, nonce: nonce(), sentAt: new Date(opts.now ?? Date.now()).toISOString() };
  const payload = signedPayload(request);
  if (opts.recoveryCode) request.proof = await hmacSha256(await recoveryVerifier(opts.recoveryCode), payload);
  else request.sig = await signEd25519(state.keys!.privateKey, payload);

  let response: Response;
  try {
    response = await crowdFetch('/v1/delete', POST(JSON.stringify(request)), fetchImpl, { userAction: true });
  } catch {
    return 'offline';
  }
  if (response.status !== 204) return 'refused';
  await clearQueue();
  await discardIdentity();
  return 'deleted';
}

/** The reader saw the recovery code and noted it; the device no longer needs to show it. */
export async function acknowledgeRecoveryCode(): Promise<void> {
  await updateState((s) => {
    s.recoveryCode = undefined;
  });
}
