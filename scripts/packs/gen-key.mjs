// Makes an ECDSA P-256 key pair for signing the pack manifest (ADR 0007).
//
//   node scripts/packs/gen-key.mjs <private-key-file>
//
// The PRIVATE key goes to the file you name. Keep it offline (not in this repo, not in CI secrets). The PUBLIC key
// is printed: paste it into src/packManager/publicKeys.ts. Make a second pair ahead of a rotation and keep both
// public keys there until the old one is retired.
import { existsSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { generateSigningKey } from '../../src/packManager/manifest.ts';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/packs/gen-key.mjs <private-key-file>');
  process.exit(1);
}
const repo = resolve(import.meta.dirname, '..', '..');
if (!relative(repo, resolve(out)).startsWith('..')) {
  console.error(`${out} is inside the repository. Keep the private key outside it.`);
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} already exists. Refusing to overwrite a key.`);
  process.exit(1);
}

const { privateKeyJwk, publicKey } = await generateSigningKey();
writeFileSync(out, JSON.stringify(privateKeyJwk), { mode: 0o600 });
console.log(`Private key written to ${out}. Keep it offline and secret.`);
console.log('');
console.log('Public key (put it in src/packManager/publicKeys.ts):');
console.log(publicKey);
