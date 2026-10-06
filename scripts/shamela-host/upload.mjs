#!/usr/bin/env node
// Size-capped uploader for the Shamela static host (Cloudflare R2).
//
//   node scripts/shamela-host/upload.mjs <dir> [--bucket shamela] [--max-gb 9]
//        [--max-ops 900000] [--concurrency 4] [--dry-run]
//
// <dir> mirrors the bucket layout, e.g.  <dir>/catalog.json
//                                        <dir>/books/123.json.br
//
// Guardrails (R2 free tier: 10 GB storage, 1M Class A writes / month):
//  - Refuses to start if existing + new bytes would exceed --max-gb.
//  - Stops before exceeding --max-ops writes in one run.
//  - Skips files already uploaded with the same size+mtime (state file),
//    so reruns cost no writes.
//  - catalog.json goes last, so the app never sees a catalog pointing at
//    books that aren't there yet.
// Uses `wrangler r2 object put --remote`, so no API keys are needed
// beyond `npx wrangler login`.

import { spawn } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const bucket = opt('bucket', 'shamela');
const maxBytes = Number(opt('max-gb', '9')) * 1024 ** 3;
const maxOps = Number(opt('max-ops', '900000'));
const concurrency = Number(opt('concurrency', '4'));
const dryRun = args.includes('--dry-run');

if (!dir) {
  console.error('Usage: node upload.mjs <dir> [--bucket b] [--max-gb 9] [--max-ops N] [--concurrency 4] [--dry-run]');
  process.exit(1);
}

const stateFile = join(dir, '.upload-state.json');
const state = await readFile(stateFile, 'utf8').then(JSON.parse, () => ({ files: {} }));

async function* walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name !== '.upload-state.json') yield p;
  }
}

function headersFor(key) {
  if (key === 'catalog.json') {
    // Small and changes on every publish: let clients revalidate quickly.
    return { type: 'application/json', encoding: null, cache: 'public, max-age=300, must-revalidate' };
  }
  if (key.endsWith('.json.br')) {
    // Books are immutable per id/version: cache hard at the edge and in browsers.
    return { type: 'application/json', encoding: 'br', cache: 'public, max-age=31536000, immutable' };
  }
  if (key.endsWith('.json')) {
    return { type: 'application/json', encoding: null, cache: 'public, max-age=86400' };
  }
  return { type: 'application/octet-stream', encoding: null, cache: 'public, max-age=86400' };
}

const all = [];
for await (const p of walk(dir)) {
  const s = await stat(p);
  const key = relative(dir, p).split(sep).join('/');
  all.push({ path: p, key, size: s.size, mtime: Math.floor(s.mtimeMs) });
}

const isDone = (f) => state.files[f.key]?.size === f.size && state.files[f.key]?.mtime === f.mtime;
const pending = all.filter((f) => !isDone(f));
// catalog.json last
pending.sort((a, b) => (a.key === 'catalog.json') - (b.key === 'catalog.json'));

const alreadyBytes = Object.values(state.files).reduce((n, f) => n + f.size, 0);
const newBytes = pending.reduce((n, f) => n + f.size, 0);
const gb = (n) => (n / 1024 ** 3).toFixed(3);

console.log(`Local files: ${all.length}; to upload: ${pending.length}`);
console.log(`Already in bucket: ${gb(alreadyBytes)} GB; new: ${gb(newBytes)} GB; cap: ${gb(maxBytes)} GB`);

if (alreadyBytes + newBytes > maxBytes) {
  console.error(`REFUSING: total would be ${gb(alreadyBytes + newBytes)} GB, over the ${gb(maxBytes)} GB cap.`);
  console.error('Upload a smaller subset, or raise --max-gb knowingly (storage over 10 GB is billed).');
  process.exit(2);
}
if (pending.length > maxOps) {
  console.error(`REFUSING: ${pending.length} writes exceeds --max-ops ${maxOps} (free tier is 1M Class A ops/month).`);
  process.exit(2);
}
if (dryRun || pending.length === 0) {
  console.log(dryRun ? 'Dry run: nothing uploaded.' : 'Nothing to upload.');
  process.exit(0);
}

function put(f) {
  const h = headersFor(f.key);
  const a = ['wrangler', 'r2', 'object', 'put', `${bucket}/${f.key}`, '--file', f.path, '--remote',
    '--content-type', h.type, '--cache-control', h.cache];
  if (h.encoding) a.push('--content-encoding', h.encoding);
  return new Promise((resolve, reject) => {
    const c = spawn('npx', a, { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `exit ${code}`))));
  });
}

let done = 0;
let failed = 0;
let saveChain = Promise.resolve();
const save = () => (saveChain = saveChain.then(() => writeFile(stateFile, JSON.stringify(state))));

// Everything except catalog.json runs concurrently; catalog.json waits.
const books = pending.filter((f) => f.key !== 'catalog.json');
const catalog = pending.filter((f) => f.key === 'catalog.json');

async function worker(queue) {
  for (let f = queue.shift(); f; f = queue.shift()) {
    try {
      await put(f);
      state.files[f.key] = { size: f.size, mtime: f.mtime };
      done++;
      if (done % 25 === 0) {
        await save();
        console.log(`  ${done}/${pending.length} uploaded`);
      }
    } catch (e) {
      failed++;
      console.error(`  FAILED ${f.key}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker(books)));
await save();

if (failed > 0) {
  console.error(`${failed} upload(s) failed; catalog.json NOT uploaded. Rerun to retry only the failures.`);
  process.exit(3);
}
await worker(catalog);
await save();
console.log(`Done. Uploaded ${done} file(s). Bucket now holds about ${gb(alreadyBytes + newBytes)} GB.`);
