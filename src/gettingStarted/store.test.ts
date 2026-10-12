// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { tourEvents } from './events';
import { gettingStartedStore } from './store';

describe('getting started store', () => {
  beforeEach(() => {
    localStorage.clear();
    gettingStartedStore.reset();
  });
  it('ticks an item when its event is emitted, and saves it', () => {
    tourEvents.emit('write-note');
    expect(gettingStartedStore.get().done).toContain('write-note');
    expect(JSON.parse(localStorage.getItem('arabic-reader:gettingStarted') ?? '{}').done).toContain('write-note');
  });
  it('ignores unknown events', () => {
    tourEvents.emit('nothing');
    expect(gettingStartedStore.get().done).toEqual([]);
  });
});
