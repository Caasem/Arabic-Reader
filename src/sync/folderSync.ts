import { db } from '../persistence/schema';
import { enableSyncCapture } from '../persistence/syncControl';
import { createFolderTransport, getSyncFolderBridge } from './desktopBridge';
import { createSyncEngine, type SyncResult } from './engine';

/**
 * App-level folder sync for the desktop app: the glue between the Electron
 * folder bridge, the sync engine and the default database. Settings drives it.
 */

export interface FolderSyncStatus {
  /** Folder sync only exists in the desktop app for now. */
  available: boolean;
  folder: string | null;
  enabled: boolean;
  deviceName?: string;
  lastSyncedAt?: number;
}

export async function readFolderSyncStatus(): Promise<FolderSyncStatus> {
  const bridge = getSyncFolderBridge();
  if (!bridge) return { available: false, folder: null, enabled: false };
  const [folder, meta] = await Promise.all([bridge.get(), db.syncMeta.get('local')]);
  return {
    available: true,
    folder,
    enabled: Boolean(meta?.enabled),
    deviceName: meta?.deviceName,
    lastSyncedAt: meta?.lastSyncedAt,
  };
}

export async function chooseSyncFolder(): Promise<string | null> {
  return getSyncFolderBridge()?.choose() ?? null;
}

export async function stopUsingSyncFolder(): Promise<void> {
  await getSyncFolderBridge()?.clear();
}

/** Switches capture on (seeding existing data) and runs the first pass. */
export async function turnOnFolderSync(deviceName: string): Promise<SyncResult> {
  const bridge = getSyncFolderBridge();
  if (!bridge || !(await bridge.get())) throw new Error('Choose a sync folder first.');
  await enableSyncCapture(deviceName);
  return runFolderSync();
}

let inFlight: Promise<SyncResult> | null = null;

/** One sync pass. Calls made while one is running share its result instead of overlapping. */
export function runFolderSync(): Promise<SyncResult> {
  inFlight ??= (async () => {
    try {
      const bridge = getSyncFolderBridge();
      if (!bridge || !(await bridge.get())) throw new Error('No sync folder is set.');
      return await createSyncEngine({ db, transport: createFolderTransport(bridge) }).syncNow();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
