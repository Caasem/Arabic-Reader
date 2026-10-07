/**
 * The signed pack manifest (docs/specs/data-architecture.md section 5.3,
 * ADR 0007): what the pack host serves as `manifest.json`, how it is signed and
 * how an app checks it. Pure and free of DOM and app imports, so the build
 * scripts in scripts/packs run the very same code the app will (Node strips the
 * types), and signing and checking cannot drift apart.
 *
 * Signature: ECDSA P-256 with SHA-256 over the canonical JSON of the manifest
 * without its `signature` field, in WebCrypto's IEEE P1363 form (r || s),
 * base64url. Keys travel as the raw uncompressed public point, base64url (65
 * bytes), the form compiled into the app.
 */

export const MANIFEST_FORMAT_VERSION = 1;

export type PackKind = 'dictionary' | 'frequency' | 'shamela-book' | 'audio' | 'other';
export const PACK_KINDS: readonly PackKind[] = ['dictionary', 'frequency', 'shamela-book', 'audio', 'other'];

export interface PackFile {
  /** Path inside the pack, `/`-separated, e.g. `index.json`. */
  name: string;
  /** SHA-256 of the bytes, lowercase hex. The host serves the file at `p/<hash>`. */
  hash: string;
  size: number;
}

export interface PackLicence {
  /** An SPDX identifier, or `LicenseRef-...` for a custom licence. */
  spdx: string;
  /** Where the data comes from. */
  source: string;
  attribution: string;
}

export interface PackEntry {
  id: string;
  /** Whole number, higher is newer. */
  version: number;
  title: string;
  description?: string;
  kind: PackKind;
  /** Total bytes of all files. */
  size: number;
  files: PackFile[];
  licence: PackLicence;
  /** Kill switch: false makes apps stop offering and using this pack without an app release. */
  enabled: boolean;
}

export interface Manifest {
  formatVersion: number;
  /** Goes up with every manifest published; an app never accepts a lower one than it has seen (rollback). */
  sequence: number;
  generatedAt: string;
  /** Apps older than this do not download packs from this manifest. */
  minAppVersion: string;
  packs: PackEntry[];
  /** base64url, absent until signed. */
  signature?: string;
}

export const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const FILE_NAME_PART = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Where a file lives on the host, relative to the manifest. Content-addressed, so it can be cached forever. */
export const fileObjectPath = (hash: string): string => `p/${hash}`;

/** JSON with sorted keys and no whitespace, so both sides sign the same bytes (same rules as crowd-server's canonicalJson). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
}

const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Compares dotted versions ("0.36.0" < "0.100.0"). Returns negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Why a pack entry may not be published, or null when it is fine. The licence rule is the governance gate. */
export function packProblem(p: PackEntry): string | null {
  if (!ID_PATTERN.test(p.id ?? '')) return `pack id "${String(p.id)}" must be lowercase letters, digits and dashes`;
  if (!whole(p.version) || p.version < 1) return `${p.id}: version must be a whole number from 1`;
  if (!text(p.title)) return `${p.id}: a title is required`;
  if (!PACK_KINDS.includes(p.kind)) return `${p.id}: kind must be one of ${PACK_KINDS.join(', ')}`;
  if (!text(p.licence?.spdx) || !text(p.licence?.source) || !text(p.licence?.attribution)) {
    return `${p.id}: a licence (spdx, source and attribution) must be recorded before a pack is published`;
  }
  if (typeof p.enabled !== 'boolean') return `${p.id}: enabled must be true or false`;
  if (!Array.isArray(p.files) || p.files.length === 0) return `${p.id}: a pack needs at least one file`;
  const names = new Set<string>();
  let total = 0;
  for (const f of p.files) {
    const parts = typeof f.name === 'string' ? f.name.split('/') : [];
    if (parts.length === 0 || !parts.every((x) => FILE_NAME_PART.test(x) && x !== '.' && x !== '..')) return `${p.id}: bad file name "${String(f.name)}"`;
    if (names.has(f.name)) return `${p.id}: file "${f.name}" is listed twice`;
    names.add(f.name);
    if (!HASH_PATTERN.test(f.hash ?? '')) return `${p.id}: file "${f.name}" needs a SHA-256 hash`;
    if (!whole(f.size)) return `${p.id}: file "${f.name}" needs a size in bytes`;
    total += f.size;
  }
  if (p.size !== total) return `${p.id}: size ${String(p.size)} does not match its files (${total})`;
  return null;
}

/** Why a manifest is not well formed, or null. Does not look at the signature. */
export function manifestProblem(m: unknown): string | null {
  const x = m as Manifest | null;
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return 'not an object';
  if (x.formatVersion !== MANIFEST_FORMAT_VERSION) return `unsupported format version ${String(x.formatVersion)}`;
  if (!whole(x.sequence)) return 'sequence must be a whole number';
  if (!text(x.generatedAt) || Number.isNaN(Date.parse(x.generatedAt))) return 'generatedAt must be a date';
  if (!VERSION_PATTERN.test(x.minAppVersion ?? '')) return 'minAppVersion must look like 0.36.0';
  if (!Array.isArray(x.packs)) return 'packs must be a list';
  const seen = new Set<string>();
  for (const p of x.packs) {
    const problem = packProblem(p);
    if (problem) return problem;
    if (seen.has(p.id)) return `pack ${p.id} is listed twice`;
    seen.add(p.id);
  }
  return null;
}

// -- keys and signatures ------------------------------------------------------

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' } as const;

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export interface SigningKeyPair {
  /** Keep offline. Never commit. */
  privateKeyJwk: JsonWebKey;
  /** base64url of the raw uncompressed point: what the app compiles in. */
  publicKey: string;
}

export async function generateSigningKey(): Promise<SigningKeyPair> {
  const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  return {
    privateKeyJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicKey: toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  };
}

export const importPublicKey = (publicKey: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', fromBase64Url(publicKey), ECDSA, false, ['verify']);

export const importPrivateKey = (jwk: JsonWebKey): Promise<CryptoKey> => crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);

const signedBytes = (m: Manifest): Uint8Array<ArrayBuffer> => {
  const { signature: _signature, ...rest } = m;
  return new TextEncoder().encode(canonicalJson(rest));
};

/** Signs a well-formed manifest. Throws on a manifest that must not be published. */
export async function signManifest(manifest: Manifest, privateKey: CryptoKey): Promise<Manifest> {
  const problem = manifestProblem(manifest);
  if (problem) throw new Error(`The manifest is not valid: ${problem}.`);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, signedBytes(manifest)));
  return { ...manifest, signature: toBase64Url(signature) };
}

export type ManifestCheck = { ok: true; manifest: Manifest } | { ok: false; reason: string };

/**
 * Accepts untrusted JSON as a manifest only when it is well formed and signed by
 * one of `trustedKeys` (two while a key is being rotated). Never throws.
 */
export async function verifyManifest(raw: unknown, trustedKeys: readonly string[]): Promise<ManifestCheck> {
  const problem = manifestProblem(raw);
  if (problem) return { ok: false, reason: problem };
  const manifest = raw as Manifest;
  if (typeof manifest.signature !== 'string') return { ok: false, reason: 'the manifest is not signed' };
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromBase64Url(manifest.signature);
  } catch {
    return { ok: false, reason: 'the signature is not valid base64url' };
  }
  const data = signedBytes(manifest);
  for (const trusted of trustedKeys) {
    try {
      if (await crypto.subtle.verify(SIGN_ALGORITHM, await importPublicKey(trusted), signature, data)) return { ok: true, manifest };
    } catch {
      // A malformed key or signature is a failed check, not a crash.
    }
  }
  return { ok: false, reason: 'the signature is not from a trusted key' };
}

/** SHA-256 of bytes, lowercase hex. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}
