/**
 * PackManager (roadmap `pack-manager`, docs/specs/data-architecture.md 5.3, M1f).
 *
 * Downloads, verifies, installs, updates and removes class C data packs. Dormant until a host is configured
 * (`VITE_PACKS_BASE_URL`, or the `arabic-reader:packs-base-url` setting for a mirror) AND a signing key is
 * compiled in (publicKeys.ts): with neither, nothing is fetched and every dictionary uses its bundled data.
 *
 * Touch points outside this folder:
 * - src/persistence/schema.ts (v14: `packs`, `packMeta`, `packParts`) and src/storage/registry.ts.
 * - src/dictionary/providers/alsihah/AlSihahDictionaryProvider.ts: reads its data from the pack when installed.
 * - src/components/shared/settings/DictionarySettings.tsx: the PackRow for Al-Sihah, shown only when configured.
 * - src/blobStore: the pack files (namespace `pack`, owner `<id>@<version>`).
 * To remove the feature: delete this folder, those two edits, and leave the tables (they are empty and harmless).
 */
import { getBlobStore } from '../blobStore';
import { db } from '../persistence/schema';
import { readString } from '../utils/storage';
import { createPackManager, type PackHandle, type PackManager } from './packManager';
import { TRUSTED_PACK_KEYS } from './publicKeys';

export type { PackHandle, PackManager, RefreshResult } from './packManager';
export { PackError, type PackInfo, type PackStatus } from './types';

declare const __APP_VERSION__: string;

/** A mirror or self-hosted host, set from Advanced settings later; read here so it already works. */
export const PACKS_BASE_URL_KEY = 'arabic-reader:packs-base-url';

function baseUrl(): string {
  const override = readString(PACKS_BASE_URL_KEY);
  const configured = override ?? (import.meta.env?.VITE_PACKS_BASE_URL as string | undefined) ?? '';
  return configured.trim().replace(/\/+$/, '');
}

let manager: PackManager | null = null;

export function getPackManager(): PackManager {
  manager ??= createPackManager({
    packs: db.packs,
    meta: db.packMeta,
    parts: db.packParts,
    blobs: getBlobStore,
    baseUrl,
    trustedKeys: () => TRUSTED_PACK_KEYS,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  });
  return manager;
}

/** At startup: release leftovers of an install that was killed, then fetch the manifest. Does nothing unconfigured. */
export function startPackManager(): void {
  const packs = getPackManager();
  if (!packs.configured()) return;
  void packs.repair().then(() => packs.refresh()).catch(() => undefined);
}

/**
 * The installed pack's text file, or null when the pack is not installed or cannot be read. Never throws and
 * never touches the network, so a dictionary can try it first and fall back to its bundled data.
 */
export async function installedPackText(id: string, file: string): Promise<string | null> {
  try {
    const handle: PackHandle = await getPackManager().open(id);
    return await handle.text(file);
  } catch {
    return null;
  }
}
