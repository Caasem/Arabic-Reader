import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DictionaryEntry, DictionaryProvider } from '../types';

// The module wires up the real AraMorph provider, which spawns a Worker.
class FakeWorker {
  onmessage: unknown = null;
  onerror: unknown = null;
  postMessage() {}
}

let DictionaryManager: typeof import('./DictionaryManager').DictionaryManager;

beforeAll(async () => {
  vi.stubGlobal('Worker', FakeWorker);
  ({ DictionaryManager } = await import('./DictionaryManager'));
});

const entry = (providerId: string, gloss: string): DictionaryEntry => ({
  providerId,
  providerName: providerId,
  headword: 'كتاب',
  senses: [{ gloss }],
});

function provider(id: string, lookup: DictionaryProvider['lookup'], extra: Partial<DictionaryProvider> = {}): DictionaryProvider {
  return { id, name: `Provider ${id}`, lookup, ...extra };
}

describe('DictionaryManager', () => {
  it('returns other providers’ entries when one provider fails, and does not cache the failure', async () => {
    const manager = new DictionaryManager();
    let failures = 0;
    manager.registerProvider(provider('ok', async () => [entry('ok', 'book')]));
    manager.registerProvider(
      provider('flaky', async () => {
        if (failures++ === 0) throw new Error('offline');
        return [entry('flaky', 'volume')];
      })
    );

    const first = await manager.lookup('كتاب');
    expect(first.entries.map((e) => e.senses[0].gloss)).toEqual(['book']);
    expect(first.failedProviders).toEqual([{ id: 'flaky', name: 'Provider flaky' }]);

    const retry = await manager.lookup('كتاب');
    expect(retry.entries.map((e) => e.senses[0].gloss)).toEqual(['book', 'volume']);
    expect(retry.failedProviders).toBeUndefined();
  });

  it('caches successful lookups and clears the cache when a provider reports new data', async () => {
    const manager = new DictionaryManager();
    let dataChanged: () => void = () => {};
    const lookup = vi.fn(async () => [entry('p', 'book')]);
    manager.registerProvider(
      provider('p', lookup, {
        onDataChanged: (listener) => {
          dataChanged = listener;
          return () => {};
        },
      })
    );

    await manager.lookup('كتاب');
    await manager.lookup('كتاب');
    expect(lookup).toHaveBeenCalledTimes(1);

    dataChanged();
    await manager.lookup('كتاب');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('only queries enabled providers', async () => {
    const manager = new DictionaryManager();
    const a = vi.fn(async () => [entry('a', 'x')]);
    const b = vi.fn(async () => [entry('b', 'y')]);
    manager.registerProvider(provider('a', a));
    manager.registerProvider(provider('b', b));
    manager.setEnabledProviders(['b']);
    const result = await manager.lookup('كتاب');
    expect(result.entries.map((e) => e.providerId)).toEqual(['b']);
    expect(a).not.toHaveBeenCalled();
  });
});
