import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { combinedMeaning, entryMeaning, formatDueIn, vocabularyService } from './vocabularyService';
import type { BookMeta, DictionaryEntry } from '../types';

const book: BookMeta = { id: 'book_test', title: 'Test Book', format: 'epub', addedAt: 0, sizeBytes: 0 };
const entries: DictionaryEntry[] = [
  { providerId: 'p', providerName: 'P', headword: 'كتب', senses: [{ gloss: 'write' }, { gloss: 'record' }] },
  { providerId: 'p', providerName: 'P', headword: 'كتب', senses: [{ gloss: 'books' }] },
];

describe('meaning helpers', () => {
  it('joins senses within an entry and entries within a card', () => {
    expect(entryMeaning(entries[0])).toBe('write; record');
    expect(combinedMeaning(entries)).toBe('write; record | books');
  });
});

describe('formatDueIn', () => {
  const now = 1_000_000_000_000;
  it.each([
    [30_000, '<1m'],
    [5 * 60_000, '5m'],
    [3 * 3_600_000, '3h'],
    [2 * 86_400_000, '2d'],
    [45 * 86_400_000, '2mo'],
    [400 * 86_400_000, '1y'],
  ])('formats %i ms as %s', (delta, label) => {
    expect(formatDueIn(now + delta, now)).toBe(label);
  });
});

describe('FSRS scheduling', () => {
  it('saves a new card due immediately and reschedules it after a review', async () => {
    const item = await vocabularyService.saveToVocabulary({ surfaceForm: 'كتب', entries, book });
    expect(item.fsrsReps).toBe(0);
    expect(item.selectedEntryIndex).toBeUndefined();
    expect(item.meaning).toBe('write; record | books');

    const previews = vocabularyService.previewGrades(item, item.addedAt);
    expect(previews.again.dueAt).toBeLessThanOrEqual(previews.hard.dueAt);
    expect(previews.hard.dueAt).toBeLessThanOrEqual(previews.good.dueAt);
    expect(previews.good.dueAt).toBeLessThanOrEqual(previews.easy.dueAt);

    const reviewed = await vocabularyService.recordReviewResult(item, 'good');
    expect(reviewed.fsrsReps).toBe(1);
    expect(reviewed.fsrsDue).toBeGreaterThan(item.fsrsDue);
    expect(reviewed.successfulRecalls).toBe(1);
  });
});
