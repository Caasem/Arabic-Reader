import { base64url, installIdFromPublicKey } from '../../crowd-server/src/crypto';
import { loadState, updateState } from './state';
import type { CrowdStateRow } from './types';

type WithIdentity = CrowdStateRow & { keys: NonNullable<CrowdStateRow['keys']>; installId: string };

/** Whether this device can sign with Ed25519. Without it the feature stays off (section 10). */
export async function isCryptoSupported(): Promise<boolean> {
  try {
    await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    return true;
  } catch {
    return false;
  }
}

/**
 * The install's key pair, made on first use (section 5.4). The private key is created non-extractable, so it
 * stays in the browser's key store and cannot be read back out. The id comes from the public key.
 */
export async function ensureIdentity(): Promise<WithIdentity> {
  const existing = await loadState();
  if (existing.keys && existing.installId) return existing as WithIdentity;
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const installId = await installIdFromPublicKey(raw);
  const state = await updateState((row) => {
    if (row.keys && row.installId) return; // another call got there first
    row.keys = { publicKey: base64url(raw), privateKey: pair.privateKey };
    row.installId = installId;
    row.registered = false;
    row.seq = 0;
    row.maxRev = 0;
    row.recoveryCode = undefined;
    row.blocked = false;
  });
  return state as WithIdentity;
}

/** Forgets the identity: a deleted or reset install never reuses its key or id (section 12.1). */
export async function discardIdentity(): Promise<void> {
  await updateState((row) => {
    row.keys = undefined;
    row.installId = undefined;
    row.recoveryCode = undefined;
    row.registered = false;
    row.seq = 0;
    row.maxRev = 0;
    row.blocked = false;
  });
}
