// Makes the Ed25519 key pair that signs ranking manifests (docs/specs/crowd-sense-ranking.md, section 9.5).
//
//   node crowd-server/scripts/gen-signing-key.mjs <private-key-file>
//
// The PRIVATE key goes to the file you name (keep it offline or in a secret store, never in git) and is what you
// give `wrangler secret put SIGNING_KEY`. The PUBLIC key is printed: it is compiled into the app.
import { existsSync, writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node crowd-server/scripts/gen-signing-key.mjs <private-key-file>');
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} already exists. Refusing to overwrite a key.`);
  process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const b64url = Buffer.from(raw).toString('base64url');

writeFileSync(out, JSON.stringify(jwk), { mode: 0o600 });
console.log(`Private key written to ${out}. Keep it secret.`);
console.log('');
console.log('Public key (put it in src/crowdSync/publicKeys.ts):');
console.log(b64url);
console.log('');
console.log('To install the private key in the Worker:');
console.log(`  wrangler secret put SIGNING_KEY < ${out}`);
