import type { Table } from 'dexie';
import type { BlobStore } from '../blobStore';
import { isQuotaError } from '../blobStore/types';
import { downloadFile, type PartStore } from './download';
import { compareVersions, fileObjectPath, verifyManifest, type Manifest, type PackEntry } from './manifest';
import { PackError, type InstalledPackRow, type PackInfo, type PackMetaRow, type PackPartRow, type PackStatus } from './types';

const NS = 'pack';
const ownerOf = (id: string, version: number) => `${id}@${version}`;
const isOwnerOf = (owner: string, id: string) => owner.startsWith(`${id}@`);

export interface PackManagerDeps {
  packs: Table<InstalledPackRow, string>;
  meta: Table<PackMetaRow, string>;
  parts: Table<PackPartRow, string>;
  blobs: () => BlobStore;
  /** Where the host serves `manifest.json` and `p/<hash>`, no trailing slash; empty when no host is configured. */
  baseUrl: () => string;
  /** Public keys that may sign the manifest (two while rotating). */
  trustedKeys: () => readonly string[];
  appVersion: string;
  fetchImpl?: () => typeof fetch;
  now?: () => number;
  /** Test hooks: smaller ranges so a small file exercises resume. */
  rangeSize?: number;
  rangeThreshold?: number;
}

export type RefreshResult = 'updated' | 'unchanged' | 'offline' | 'rejected' | 'not-configured';

export interface InstallOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface PackHandle {
  id: string;
  version: number;
  /** One file of the pack, by its name in the manifest. */
  file(name: string): Promise<Blob>;
  text(name: string): Promise<string>;
}

export interface PackManager {
  /** From the cached manifest, so it works offline. Empty until a manifest has been fetched once. */
  available(): Promise<PackInfo[]>;
  /** Fetches and verifies the manifest. Keeps the previous one on any failure. Network only. */
  refresh(): Promise<RefreshResult>;
  /** True when a host and a key are configured; otherwise the whole feature stays dormant. */
  configured(): boolean;
  status(id: string): Promise<PackInfo | undefined>;
  install(id: string, options?: InstallOptions): Promise<void>;
  uninstall(id: string): Promise<void>;
  open(id: string): Promise<PackHandle>;
  /** Called after any change of state or progress. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Releases references left by an install that was killed before it finished. Safe to call at any time. */
  repair(): Promise<void>;
}

export function createPackManager(deps: PackManagerDeps): PackManager {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const running = new Map<string, { promise: Promise<void>; progress: number }>();
  const failures = new Map<string, string>();

  const configured = () => deps.baseUrl() !== '' && deps.trustedKeys().length > 0;
  const fetchImpl = () => (deps.fetchImpl ? deps.fetchImpl() : fetch);

  const partStore: PartStore = {
    async get(hash, index) {
      return (await deps.parts.get(`${hash}:${index}`))?.data;
    },
    async put(hash, index, data) {
      await deps.parts.put({ key: `${hash}:${index}`, hash, index, data });
    },
    async clear(hash) {
      await deps.parts.where('hash').equals(hash).delete();
    },
  };

  async function cachedManifest(): Promise<Manifest | undefined> {
    return (await deps.meta.get('manifest'))?.manifest;
  }

  /** Whether this app is too old for the manifest or the pack; the reason when so. */
  function tooOld(manifest: Manifest): string | undefined {
    if (!/^\d+\.\d+\.\d+/.test(deps.appVersion)) return undefined; // a development or test build
    return compareVersions(deps.appVersion, manifest.minAppVersion) < 0 ? 'Needs a newer app version.' : undefined;
  }

  function describe(entry: PackEntry, installed: InstalledPackRow | undefined, manifest: Manifest): PackInfo {
    const base = {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      version: entry.version,
      size: entry.size,
      licence: entry.licence,
      installedVersion: installed?.version,
    };
    const run = running.get(entry.id);
    if (run) return { ...base, status: 'downloading', progress: run.progress };
    const failure = failures.get(entry.id);
    if (!entry.enabled) return { ...base, status: 'disabled', reason: 'This pack is not available any more.' };
    if (failure) return { ...base, status: 'failed', reason: failure };
    const old = tooOld(manifest);
    if (installed) {
      if (installed.version < entry.version) return { ...base, status: 'update-available', ...(old ? { reason: old } : {}) };
      return { ...base, status: 'ready' };
    }
    return { ...base, status: 'absent', ...(old ? { reason: old } : {}) };
  }

  /** What is installed but no longer in the manifest still works; it is described from its own record. */
  function describeInstalledOnly(row: InstalledPackRow): PackInfo {
    const run = running.get(row.id);
    const status: PackStatus = run ? 'downloading' : 'ready';
    return {
      id: row.id,
      title: row.title,
      kind: 'other',
      version: row.version,
      size: row.size,
      licence: { spdx: '', source: '', attribution: '' },
      status,
      installedVersion: row.version,
      reason: 'No longer offered.',
      ...(run ? { progress: run.progress } : {}),
    };
  }

  async function status(id: string): Promise<PackInfo | undefined> {
    const manifest = await cachedManifest();
    const installed = await deps.packs.get(id);
    const entry = manifest?.packs.find((p) => p.id === id);
    if (entry && manifest) return describe(entry, installed, manifest);
    return installed ? describeInstalledOnly(installed) : undefined;
  }

  /** Releases every pack reference that is not the installed version's, and any ranges nobody finished. */
  async function releaseStale(id: string, keepVersion?: number): Promise<void> {
    const keep = keepVersion === undefined ? undefined : ownerOf(id, keepVersion);
    for await (const ref of deps.blobs().list(NS)) {
      for (const owner of ref.owners) {
        if (isOwnerOf(owner, id) && owner !== keep) await deps.blobs().unpin(ref.hash, NS, owner);
      }
    }
  }

  async function doInstall(entry: PackEntry, manifest: Manifest, options: InstallOptions, run: { progress: number }): Promise<void> {
    const old = tooOld(manifest);
    if (old) throw new PackError('needs-newer-app', old);
    if (!entry.enabled) throw new PackError('disabled', 'This pack is not available any more.');
    if (!configured()) throw new PackError('not-configured', 'Pack downloads are not available in this build.');

    const blobs = deps.blobs();
    const owner = ownerOf(entry.id, entry.version);
    const total = entry.files.reduce((n, f) => n + f.size, 0) || 1;
    let finished = 0;
    for (const file of entry.files) {
      if (options.signal?.aborted) throw new PackError('aborted', 'The download was cancelled.');
      if (!(await blobs.pin(file.hash, NS, owner))) {
        const url = `${deps.baseUrl()}/${fileObjectPath(file.hash)}`;
        const data = await downloadFile({
          url,
          hash: file.hash,
          size: file.size,
          parts: partStore,
          fetchImpl: fetchImpl(),
          signal: options.signal,
          rangeSize: deps.rangeSize,
          rangeThreshold: deps.rangeThreshold,
          onProgress: (bytes) => {
            run.progress = Math.min(1, (finished + bytes) / total);
            options.onProgress?.(run.progress);
            notify();
          },
        });
        try {
          const ref = await blobs.put(data, { ns: NS, owner, type: 'application/octet-stream' });
          if (ref.hash !== file.hash) throw new PackError('verification', 'Verification failed: the stored copy does not match.');
        } catch (error) {
          if (error instanceof PackError) throw error;
          if (isQuotaError(error)) throw new PackError('quota', 'Not enough space on this device.', { cause: error });
          throw error;
        }
      }
      finished += file.size;
      run.progress = Math.min(1, finished / total);
      notify();
    }

    // Every file is here and verified. One write flips the installed version; the old version's bytes are
    // released only after, so a kill at any point leaves a complete, working pack.
    await deps.packs.put({ id: entry.id, version: entry.version, title: entry.title, files: entry.files, size: entry.size, installedAt: now() });
    await releaseStale(entry.id, entry.version);
  }

  return {
    configured,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async available() {
      const manifest = await cachedManifest();
      if (!manifest) return [];
      const installed = new Map((await deps.packs.toArray()).map((r) => [r.id, r]));
      return manifest.packs.filter((p) => p.enabled || installed.has(p.id)).map((p) => describe(p, installed.get(p.id), manifest));
    },

    status,

    async refresh() {
      if (!configured()) return 'not-configured';
      let raw: unknown;
      try {
        const response = await fetchImpl()(`${deps.baseUrl()}/manifest.json`, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' });
        if (!response.ok) return 'offline';
        raw = await response.json();
      } catch {
        return 'offline'; // no connection, or not JSON: keep what we have
      }
      const checked = await verifyManifest(raw, deps.trustedKeys());
      if (!checked.ok) {
        console.warn(`Pack manifest ignored: ${checked.reason}.`);
        return 'rejected';
      }
      const previous = await cachedManifest();
      if (previous && checked.manifest.sequence < previous.sequence) {
        console.warn('Pack manifest ignored: it is older than the one already accepted.');
        return 'rejected';
      }
      if (previous && checked.manifest.sequence === previous.sequence) return 'unchanged';
      await deps.meta.put({ id: 'manifest', manifest: checked.manifest, fetchedAt: now() });
      notify();
      return 'updated';
    },

    install(id, options = {}) {
      const existing = running.get(id);
      if (existing) return existing.promise;
      const run = { progress: 0, promise: Promise.resolve() };
      const promise = (async () => {
        const manifest = await cachedManifest();
        const entry = manifest?.packs.find((p) => p.id === id);
        if (!manifest || !entry) throw new PackError('not-offered', 'This pack is not offered.');
        failures.delete(id);
        try {
          await doInstall(entry, manifest, options, run);
        } catch (error) {
          const packError = error instanceof PackError ? error : new PackError('offline', 'The download failed.', { cause: error });
          // Cancelling is not a failure; a pack that is not offered or too new is shown by its own status.
          if (packError.code !== 'aborted') failures.set(id, packError.message);
          throw packError;
        }
      })().finally(() => {
        running.delete(id);
        notify();
      });
      run.promise = promise;
      running.set(id, run);
      notify();
      return promise;
    },

    async uninstall(id) {
      const run = running.get(id);
      await run?.promise.catch(() => undefined);
      const row = await deps.packs.get(id);
      await deps.packs.delete(id);
      await releaseStale(id);
      for (const file of row?.files ?? []) await partStore.clear(file.hash);
      failures.delete(id);
      notify();
    },

    async open(id) {
      const row = await deps.packs.get(id);
      if (!row) throw new PackError('not-offered', 'This pack is not installed.');
      const entry = (await cachedManifest())?.packs.find((p) => p.id === id);
      if (entry && !entry.enabled) throw new PackError('disabled', 'This pack is not available any more.');
      const file = async (name: string): Promise<Blob> => {
        const f = row.files.find((x) => x.name === name);
        const data = f ? await deps.blobs().get(f.hash) : undefined;
        if (!data) throw new PackError('verification', `"${name}" is missing from the pack on this device.`);
        return data;
      };
      return { id, version: row.version, file, text: async (name) => (await file(name)).text() };
    },

    async repair() {
      const installed = new Map((await deps.packs.toArray()).map((r) => [r.id, r.version]));
      for await (const ref of deps.blobs().list(NS)) {
        for (const owner of ref.owners) {
          const at = owner.lastIndexOf('@');
          const id = owner.slice(0, at);
          if (running.has(id) || installed.get(id) === Number(owner.slice(at + 1))) continue;
          await deps.blobs().unpin(ref.hash, NS, owner);
        }
      }
    },
  };
}
