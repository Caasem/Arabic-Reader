import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArabicReaderDB } from '../persistence/schema';
import { createSyncControl } from '../persistence/syncControl';
import { createWriteLayer } from '../persistence/writeLayer';
import { createSyncEngine } from './engine';
import { createSyncScheduler } from './scheduler';
import { memoryTransport } from './transport';

// Fake only the timers the scheduler uses; fake-indexeddb needs the real setImmediate.
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

let counter = 0;

/** A device with its own database, wired the way the app wires it: change signal -> scheduler -> engine. */
async function device(name: string, folder: ReturnType<typeof memoryTransport>, pollMs = 0) {
  const db = new ArabicReaderDB(`auto-${name}-${counter++}`);
  await db.open();
  const engine = createSyncEngine({ db, transport: folder });
  const scheduler = createSyncScheduler({
    run: async () => void (await engine.syncNow()),
    isEnabled: async () => Boolean((await db.syncMeta.get('local'))?.enabled),
    pollMs,
  });
  const layer = createWriteLayer(db, () => scheduler.notifyChange());
  await createSyncControl(db).enableSyncCapture(name);
  return { db, layer, scheduler };
}

/** Let queued IndexedDB work finish. */
async function settle() {
  for (let i = 0; i < 80; i++) await new Promise((r) => setImmediate(r));
}

const word = (id: string, meaning: string) => ({ id, surfaceForm: id, bookId: 'b', addedAt: 1, meaning }) as never;

describe('automatic sync, end to end', () => {
  it('a saved change reaches another device with no button pressed', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const b = await device('B', folder, 300_000);

    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await vi.advanceTimersByTimeAsync(9_000);
    await settle();
    expect(folder.files.size).toBe(0); // still inside the debounce

    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(folder.files.size).toBe(1); // A published on its own

    await vi.advanceTimersByTimeAsync(300_000); // B's slow poll
    await settle();
    expect((await b.db.vocabulary.get('v1'))?.meaning).toBe('book');

    a.scheduler.dispose();
    b.scheduler.dispose();
  });

  it('opening the app picks up changes made while it was closed', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    a.scheduler.trigger('manual');
    await vi.advanceTimersByTimeAsync(5);
    await settle();

    const b = await device('B', folder);
    b.scheduler.trigger('open');
    await vi.advanceTimersByTimeAsync(5);
    await settle();
    expect((await b.db.vocabulary.get('v1'))?.meaning).toBe('book');
    a.scheduler.dispose();
    b.scheduler.dispose();
  });

  it('a folder that is briefly unavailable is retried, and nothing is lost', async () => {
    const folder = memoryTransport();
    const a = await device('A', folder);
    const realWrite = folder.write;
    let down = true;
    folder.write = async (path, text) => {
      if (down) throw new Error('folder offline');
      return realWrite(path, text);
    };

    await a.layer.putSynced('vocabulary', word('v1', 'book'));
    await vi.advanceTimersByTimeAsync(11_000);
    await settle();
    expect(a.scheduler.getState().failures).toBe(1);
    expect(folder.files.size).toBe(0);
    expect(await a.db.syncOutbox.filter((e) => e.publishedAt === undefined).count()).toBe(1);

    down = false;
    await vi.advanceTimersByTimeAsync(31_000); // past the 30 s backoff
    await settle();
    expect(folder.files.size).toBe(1);
    expect(a.scheduler.getState().failures).toBe(0);
    a.scheduler.dispose();
  });
});
