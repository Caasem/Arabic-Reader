// Builds and checks a pack repository: the folder a static host serves.
//
//   <out>/manifest.json        signed, short cache time
//   <out>/p/<sha256>           every pack file, named by its hash, immutable
//
// Input is a folder of pack folders; each holds a `pack.json` (id, version, title, kind, licence ...) and the
// pack's files. Shares its manifest code with the app (src/packManager/manifest.ts), so what is signed here is
// exactly what the app checks. See docs/specs/data-architecture.md 5.3 and ADR 0007.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import {
  MANIFEST_FORMAT_VERSION,
  fileObjectPath,
  importPrivateKey,
  manifestProblem,
  packProblem,
  signManifest,
  verifyManifest,
} from '../../src/packManager/manifest.ts';

const sha256File = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

/** Reads one pack folder into a manifest entry plus the files to copy. Throws a readable message when it may not be published. */
export async function readPack(dir) {
  const definition = JSON.parse(await readFile(join(dir, 'pack.json'), 'utf8').catch(() => {
    throw new Error(`${dir}: pack.json is missing.`);
  }));
  const files = [];
  const sources = new Map();
  for await (const path of walk(dir)) {
    const name = relative(dir, path).split(sep).join('/');
    if (name === 'pack.json') continue;
    const hash = await sha256File(path);
    files.push({ name, hash, size: (await stat(path)).size });
    sources.set(hash, path);
  }
  files.sort((a, b) => (a.name < b.name ? -1 : 1));
  const entry = {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    ...(definition.description ? { description: definition.description } : {}),
    kind: definition.kind,
    size: files.reduce((n, f) => n + f.size, 0),
    files,
    licence: definition.licence,
    enabled: definition.enabled ?? true,
  };
  const problem = packProblem(entry);
  if (problem) throw new Error(`${dir}: ${problem}.`);
  return { entry, sources };
}

async function readPreviousManifest(out) {
  try {
    return JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Builds `out` from the pack folders under `packsRoot`. A pack's version is immutable: building the same id and
 * version with different bytes, or an older version than the one already published, is refused.
 * `privateKeyJwk` is the signing key; it is only ever read from where the caller keeps it.
 */
export async function buildRepository({ packsRoot, out, privateKeyJwk, minAppVersion, now = new Date() }) {
  const found = [];
  for (const e of await readdir(packsRoot, { withFileTypes: true })) {
    if (e.isDirectory()) found.push(await readPack(join(packsRoot, e.name)));
  }
  if (found.length === 0) throw new Error(`No packs found under ${packsRoot} (each needs a folder with a pack.json).`);

  const previous = await readPreviousManifest(out);
  for (const { entry } of found) {
    const was = previous?.packs?.find((p) => p.id === entry.id);
    if (!was) continue;
    if (entry.version < was.version) throw new Error(`${entry.id}: version ${entry.version} is older than the published ${was.version}.`);
    if (entry.version === was.version && JSON.stringify(entry.files) !== JSON.stringify(was.files)) {
      throw new Error(`${entry.id}: version ${entry.version} is already published with different files. Raise the version.`);
    }
  }

  const manifest = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    sequence: (previous?.sequence ?? 0) + 1,
    generatedAt: now.toISOString(),
    minAppVersion,
    packs: found.map((f) => f.entry).sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  const signed = await signManifest(manifest, await importPrivateKey(privateKeyJwk));

  // Files first, the manifest last: a client never sees a manifest that names files not there yet.
  for (const { sources } of found) {
    for (const [hash, path] of sources) {
      const target = join(out, fileObjectPath(hash));
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.tmp`;
      await copyFile(path, temp);
      await rename(temp, target);
    }
  }
  await writeFile(join(out, 'manifest.json.tmp'), JSON.stringify(signed, null, 2) + '\n');
  await rename(join(out, 'manifest.json.tmp'), join(out, 'manifest.json'));
  return signed;
}

/**
 * Checks a repository the way an app would: the manifest is signed by a trusted key, and every file it names is
 * there with the stated size and SHA-256. Returns the problems found (empty when it is sound).
 */
export async function verifyRepository({ dir, trustedKeys }) {
  const problems = [];
  let raw;
  try {
    raw = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return ['manifest.json is missing or is not JSON'];
  }
  const checked = await verifyManifest(raw, trustedKeys);
  if (!checked.ok) return [`manifest: ${checked.reason}`];
  const problem = manifestProblem(checked.manifest);
  if (problem) return [`manifest: ${problem}`];
  for (const pack of checked.manifest.packs) {
    for (const file of pack.files) {
      const where = `${pack.id} ${file.name}`;
      const path = join(dir, fileObjectPath(file.hash));
      let size;
      try {
        size = (await stat(path)).size;
      } catch {
        problems.push(`${where}: missing (${fileObjectPath(file.hash)})`);
        continue;
      }
      if (size !== file.size) problems.push(`${where}: is ${size} bytes, the manifest says ${file.size}`);
      else if ((await sha256File(path)) !== file.hash) problems.push(`${where}: contents do not match their hash`);
    }
  }
  return problems;
}
