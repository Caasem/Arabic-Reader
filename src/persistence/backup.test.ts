import { describe, expect, it } from 'vitest';
import { BackupFormatError, parseBackup } from './backup';

const NOW = 1_700_000_000_000;

describe('parseBackup', () => {
  it('rejects files that are not backups or come from a newer format', () => {
    expect(() => parseBackup(null)).toThrow(BackupFormatError);
    expect(() => parseBackup({ vocabulary: 'nope' })).toThrow(BackupFormatError);
    expect(() => parseBackup({ formatVersion: 2, vocabulary: [] })).toThrow(/newer version/);
  });

  it('drops rows missing identifying fields and counts them', () => {
    const { data, skipped } = parseBackup(
      {
        formatVersion: 1,
        vocabulary: [{ id: 'v1', surfaceForm: 'كتاب', bookId: 'b1' }, { surfaceForm: 'no id' }, 42],
        wordInstances: [{ bookId: 'b1', normalizedForm: 'كتاب', key: 'b1::كتاب' }, { bookId: 'b1' }],
        highlights: [{ id: 'h1', bookId: 'b1', cfiRange: 'epubcfi(/6/2)' }, { id: 'h2' }],
      },
      NOW
    );
    expect(data.vocabulary.map((v) => v.id)).toEqual(['v1']);
    expect(data.wordInstances).toHaveLength(1);
    expect(data.highlights).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  it('fills in missing fields with safe defaults', () => {
    const { data } = parseBackup(
      {
        vocabulary: [{ id: 'v1', surfaceForm: 'كتاب', bookId: 'b1', mastery: 'bogus' }],
        wordInstances: [{ bookId: 'b1', normalizedForm: 'كتاب', key: 'stale-key' }],
        highlights: [{ id: 'h1', bookId: 'b1', cfiRange: 'x', color: 'pink' }],
      },
      NOW
    );
    const [item] = data.vocabulary;
    expect(item).toMatchObject({ meaning: '', entries: [], mastery: 'new', successfulRecalls: 0, fsrsDue: NOW, fsrsReps: 0 });
    expect(data.wordInstances[0]).not.toHaveProperty('key');
    expect(data.wordInstances[0]).toMatchObject({ surfaceForm: 'كتاب', saved: false, encounterCount: 1 });
    expect(data.highlights[0].color).toBe('yellow');
  });

  it('keeps existing FSRS state untouched', () => {
    const { data } = parseBackup(
      { vocabulary: [{ id: 'v1', surfaceForm: 'x', bookId: 'b', fsrsDue: 123, fsrsReps: 4, fsrsStability: 12.5 }] },
      NOW
    );
    expect(data.vocabulary[0]).toMatchObject({ fsrsDue: 123, fsrsReps: 4, fsrsStability: 12.5 });
  });
});
