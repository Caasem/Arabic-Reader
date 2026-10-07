// Builds a pack repository (the folder a static host serves) and signs its manifest.
//
//   node scripts/packs/build.mjs <packs-folder> <out-folder> --key-file <private-key-file> [--min-app-version 0.36.0]
//
// <packs-folder> holds one folder per pack, each with a pack.json and the pack's files. Then upload <out-folder>
// (files first, manifest.json last), see scripts/shamela-host/upload.mjs for the R2 uploader. The signing key is
// read from --key-file, or from the PACK_SIGNING_KEY environment variable; it must not live inside the repository.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { buildRepository, verifyRepository } from './lib.mjs';
import { importPublicKey } from '../../src/packManager/manifest.ts';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const [packsRoot, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const keyFile = opt('key-file');
const repo = resolve(import.meta.dirname, '..', '..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!packsRoot || !out) fail('Usage: node scripts/packs/build.mjs <packs-folder> <out-folder> --key-file <file> [--min-app-version 0.36.0]');
if (keyFile && !relative(repo, resolve(keyFile)).startsWith('..')) fail(`${keyFile} is inside the repository. Keep the private key outside it.`);
const keyText = keyFile ? readFileSync(keyFile, 'utf8') : process.env.PACK_SIGNING_KEY;
if (!keyText) fail('No signing key: pass --key-file <file> or set PACK_SIGNING_KEY.');
const privateKeyJwk = JSON.parse(keyText);
const minAppVersion = opt('min-app-version') ?? JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')).version;

try {
  const manifest = await buildRepository({ packsRoot, out, privateKeyJwk, minAppVersion });
  // Check what was just written against the key's own public half, as an app would.
  const publicJwk = { kty: privateKeyJwk.kty, crv: privateKeyJwk.crv, x: privateKeyJwk.x, y: privateKeyJwk.y };
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')]);
  await importPublicKey(raw.toString('base64url'));
  const problems = await verifyRepository({ dir: out, trustedKeys: [raw.toString('base64url')] });
  if (problems.length) fail(`Built, but the result does not verify:\n  ${problems.join('\n  ')}`);
  console.log(`Manifest #${manifest.sequence}: ${manifest.packs.map((p) => `${p.id} v${p.version}`).join(', ')}`);
  console.log(`Written to ${out}. Verified.`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
