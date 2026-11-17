import { describe, expect, it, vi } from 'vitest';
import { addScanned, describeAdd } from './addScanned';

class Duplicate extends Error {}

describe('addScanned', () => {
  it('imports each file with its name, and counts added, duplicate and failed ones', async () => {
    const imported: string[] = [];
    const steps: string[] = [];
    const summary = await addScanned(
      ['C:\\Books\\one.pdf', '/home/me/two.epub', '/home/me/dup.pdf', '/home/me/bad.mobi', '/home/me/gone.pdf'],
      {
        read: async (path) => {
          if (path.endsWith('gone.pdf')) throw new Error('That file was not found by the scan.');
          return new Uint8Array([1, 2, 3]);
        },
        importFile: async (file) => {
          if (file.name === 'dup.pdf') throw new Duplicate('already');
          if (file.name === 'bad.mobi') throw new Error('Could not read this MOBI.');
          imported.push(`${file.name}:${file.size}`);
        },
        isDuplicate: (e) => e instanceof Duplicate,
      },
      (done, total, name) => steps.push(`${done + 1}/${total} ${name}`)
    );
    expect(imported).toEqual(['one.pdf:3', 'two.epub:3']);
    expect(summary).toEqual({ added: 2, duplicates: 1, failed: ['bad.mobi: Could not read this MOBI.', 'gone.pdf: That file was not found by the scan.'] });
    expect(steps[0]).toBe('1/5 one.pdf');
    expect(steps).toHaveLength(5);
  });

  it('adds nothing for an empty choice', async () => {
    const importFile = vi.fn();
    expect(await addScanned([], { read: vi.fn(), importFile, isDuplicate: () => false })).toEqual({ added: 0, duplicates: 0, failed: [] });
    expect(importFile).not.toHaveBeenCalled();
  });

  it('says how it went in one sentence', () => {
    expect(describeAdd({ added: 1, duplicates: 0, failed: [] })).toBe('Added 1 book.');
    expect(describeAdd({ added: 3, duplicates: 2, failed: ['x'] })).toBe('Added 3 books, 2 already in your library, 1 could not be added.');
    expect(describeAdd({ added: 0, duplicates: 0, failed: [] })).toBe('Nothing was added.');
  });
});
