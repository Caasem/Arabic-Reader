// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bookProgress, chapterStarts, estimatePages } from './progress';
import { offsetWithin, rangeAt } from './textOffsets';
import { dueText, statusOf, statusText } from './vocabStatus';
import type { VocabularyItem } from '../types';

describe('progress', () => {
  it('weighs chapters by their length', () => {
    expect(bookProgress([100, 300], 0, 0.5)).toBe(0.125);
    expect(bookProgress([100, 300], 1, 0)).toBe(0.25);
    expect(chapterStarts([100, 300, 100])).toEqual([0.2, 0.8]);
  });

  it('estimates the book’s pages from the current chapter', () => {
    const est = estimatePages([1000, 2000, 500], 1, 4, 2);
    expect(est.ranges).toEqual([
      [1, 2],
      [3, 6],
      [7, 7],
    ]);
    expect(est.current).toBe(5);
    expect(est.total).toBe(7);
  });
});

describe('text offsets', () => {
  it('turns DOM positions into offsets and back', () => {
    const section = document.createElement('section');
    section.innerHTML = '<h1>عنوان</h1><p><span>خير</span> جليس</p>';
    const word = section.querySelector('span')!;
    expect(offsetWithin(section, word, 0)).toBe(5);
    const range = rangeAt(section, 5, 8)!;
    expect(range.toString()).toBe('خير');
    expect(rangeAt(section, 5, 100)).toBeNull();
  });
});

describe('word status', () => {
  const now = new Date(2026, 9, 1, 12).getTime();
  const item = (mastery: VocabularyItem['mastery'], fsrsDue: number) => ({ mastery, fsrsDue }) as VocabularyItem;

  it('describes when a card is due in calendar days', () => {
    expect(dueText(now - 1000, now)).toBe('due today');
    expect(dueText(now + 20 * 3_600_000, now)).toBe('review tomorrow');
    expect(dueText(now + 12 * 86_400_000, now)).toBe('review in 12 days');
  });

  it('shows the least-learned card and the soonest due date', () => {
    expect(statusText(statusOf([]), now)).toBe('Not saved');
    expect(statusText(statusOf([item('known', now + 5 * 86_400_000), item('learning', now + 86_400_000)]), now)).toBe('Learning · review tomorrow');
  });
});
