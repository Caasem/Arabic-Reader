import 'fake-indexeddb/auto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArabicReaderDB } from '../persistence/schema';
import { createSyncControl } from '../persistence/syncControl';
import { createWriteLayer } from '../persistence/writeLayer';
import { createFolderTransport, type SyncFolderBridge } from './desktopBridge';
import { createSyncEngine } from './engine';

const { createSyncFolder } = createRequire(import.meta.url)('../../electron/syncFolder.cjs') as {
  createSyncFolder(o: { getRoot: () => string | null }): Omit<SyncFolderBridge, 'get' | 'choose' | 'clear'>;
};

let root: string;
let counter = 0;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ar-sync-int-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A device whose transport is the real Electron folder module over a real directory. */
async function device(name: string) {
  const db = new ArabicReaderDB(`folder-int-${name}-${counter++}`);
  await db.open();
  const folder = createSyncFolder({ getRoot: () => root });
  const bridge: SyncFolderBridge = { get: async () => root, choose: async () => root, clear: async () => {}, ...folder };
  const control = createSyncControl(db);
  await control.enableSyncCapture(name);
  return {
    db,
    layer: createWriteLayer(db),
    engine: createSyncEngine({ db, transport: createFolderTransport(bridge) }),
  };
}

describe('sync through a real folder', () => {
  it('moves changes between two devices, including Arabic text and deletes', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.layer.putSynced('vocabulary', { id: 'v1', surfaceForm: 'كتاب', bookId: 'b', addedAt: 1, meaning: 'كتاب: book' });
    await a.layer.putSynced('vocabulary', { id: 'v2', surfaceForm: 'قلم', bookId: 'b', addedAt: 2, meaning: 'pen' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.db.vocabulary.get('v1'))?.meaning).toBe('كتاب: book');

    await b.layer.deleteSynced('vocabulary', 'v2');
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(await a.db.vocabulary.count()).toBe(1);
  });

  it('ignores stray files and half-written temporary files in the folder', async () => {
    const a = await device('A');
    const b = await device('B');
    await a.layer.putSynced('vocabulary', { id: 'v1', surfaceForm: 'x', bookId: 'b', addedAt: 1 });
    await a.engine.syncNow();
    writeFileSync(path.join(root, '.DS_Store'), 'junk');
    writeFileSync(path.join(root, 'notes.json'), '{}');
    const result = await b.engine.syncNow();
    expect(result.eventsApplied).toBe(1);
    expect(result.retryLater).toBe(0);
  });
});
