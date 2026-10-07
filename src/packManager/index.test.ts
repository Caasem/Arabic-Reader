import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getPackManager, installedPackText } from '.';

describe('the app\'s pack manager', () => {
  it('is dormant in a build with no host or key, and a dictionary falls back to its bundled data', async () => {
    const packs = getPackManager();
    expect(packs.configured()).toBe(false);
    expect(await packs.refresh()).toBe('not-configured');
    expect(await installedPackText('alsihah', 'alsihah.tsv')).toBeNull(); // never throws, never fetches
  });
});
