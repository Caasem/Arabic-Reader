/** Hashing, signatures and encodings, on Web Crypto only, so the same code runs in Node and in a Worker. */

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const enc = new TextEncoder();

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => enc.encode(s) as Uint8Array<ArrayBuffer>;

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lower case, no padding. Same encoding the app uses for its keys. */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = typeof data === 'string' ? utf8(data) : (data as Uint8Array<ArrayBuffer>);
  return new Uint8Array(await subtle().digest('SHA-256', bytes));
}

export const sha256Hex = async (data: Uint8Array | string): Promise<string> =>
  Array.from(await sha256(data), (b) => b.toString(16).padStart(2, '0')).join('');

/** `installId = base32(sha256(publicKey)[0..16])` (section 5.4). */
export async function installIdFromPublicKey(publicKeyRaw: Uint8Array): Promise<string> {
  return base32((await sha256(publicKeyRaw)).slice(0, 16));
}

/** Accepts `ed25519:<base64url>` or a bare base64url signature. */
export async function verifyEd25519(publicKeyRaw: Uint8Array<ArrayBuffer>, signature: string, message: string): Promise<boolean> {
  try {
    const sig = fromBase64url(signature.startsWith('ed25519:') ? signature.slice(8) : signature);
    if (publicKeyRaw.length !== 32 || sig.length !== 64) return false;
    const key = await subtle().importKey('raw', publicKeyRaw, { name: 'Ed25519' }, false, ['verify']);
    return await subtle().verify({ name: 'Ed25519' }, key, sig, utf8(message));
  } catch {
    return false;
  }
}

export async function signEd25519(privateKey: CryptoKey, message: string): Promise<string> {
  return 'ed25519:' + base64url(new Uint8Array(await subtle().sign({ name: 'Ed25519' }, privateKey, utf8(message))));
}

export async function generateEd25519(): Promise<{ privateKey: CryptoKey; publicKeyRaw: Uint8Array<ArrayBuffer>; privateJwk: JsonWebKey }> {
  const pair = (await subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    privateKey: pair.privateKey,
    publicKeyRaw: new Uint8Array(await subtle().exportKey('raw', pair.publicKey)),
    privateJwk: await subtle().exportKey('jwk', pair.privateKey),
  };
}

export async function importPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
}

export async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const k = await subtle().importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await subtle().sign('HMAC', k, utf8(message))));
}

export const randomBytes = (n: number): Uint8Array<ArrayBuffer> => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Compares two strings in time that does not depend on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The secret a recovery code stands for. The server stores only this, never the code (section 11). */
export async function recoveryVerifier(code: string): Promise<Uint8Array<ArrayBuffer>> {
  return sha256('recovery|' + code);
}
