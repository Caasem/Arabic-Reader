// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CleanChapter } from '../readerCore/parseCleanEpub';
import { buildBookModel } from '../readerCore/bookModel';
import { searchForms, searchTexts } from '../readerCore/cleanSearch';
import { chapterForEpubPosition, formatCleanLocation, isCleanLocation, parseCleanLocation } from '../readerCore/location';
import { bookProgress, chapterStarts, estimatePages } from './progress';
import { offsetWithin, rangeAt } from './textOffsets';
import { dueText, statusOf, statusText } from './vocabStatus';
import type { VocabularyItem } from '../types';

describe('clean locations', () => {
  it('round-trips and reads the old clean reader’s chapter-only form', () => {
    const loc = { chapter: 2, start: 10, end: 14 };
    expect(parseCleanLocation(formatCleanLocation(loc))).toEqual(loc);
    expect(parseCleanLocation('clean:3')).toEqual({ chapter: 3, start: 0, end: 0 });
    expect(parseCleanLocation('epubcfi(/6/4!/4/2)')).toBeNull();
    expect(parseCleanLocation('clean:x:1')).toBeNull();
    expect(isCleanLocation('clean:1:2:3')).toBe(true);
  });

  it('maps an epub position to the clean chapter it falls in', () => {
    const chapters = [
      { title: 'a', blocks: [], href: 'OEBPS/c0.xhtml', spineIndex: 1 },
      { title: 'b', blocks: [], href: 'c2.xhtml', spineIndex: 3 },
    ] as CleanChapter[];
    expect(chapterForEpubPosition(chapters, 'epubcfi(/6/8!/4/2)')).toBe(1); // spine index 3
    expect(chapterForEpubPosition(chapters, 'epubcfi(/6/6!/4/2)')).toBe(0); // index 2 has no text: nearest before
    expect(chapterForEpubPosition(chapters, undefined, 'OEBPS/c2.xhtml#x')).toBe(1);
    expect(chapterForEpubPosition(chapters, undefined, 'missing.xhtml')).toBeNull();
  });
});

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

describe('searching the clean text', () => {
  const texts = ['الكِتَابُ خيرُ جليس', 'قرأتُ كتاباً ثم كَتَبْتُ'];
  it('ignores diacritics and returns offsets into the original text', () => {
    const hits = searchTexts(texts, 'كتاب', 'phrase');
    expect(hits.map((h) => [h.chapter, texts[h.chapter].slice(h.start, h.end)])).toEqual([
      [0, 'كِتَابُ'],
      [1, 'كتاب'],
    ]);
  });

  it('finds every query word in one paragraph for "Any word"', () => {
    const model = buildBookModel({
      title: 't',
      chapters: [{ title: 'ف', blocks: [{ t: 'p', s: 'خير جليس' }, { t: 'p', s: 'جليس كتاب خير' }] }],
    });
    const hits = searchTexts(model.texts, 'كتاب جليس', 'word', { paragraphs: model.paragraphs });
    expect(hits).toHaveLength(1);
    expect(hits[0].match).toBe('كتاب');
  });

  it('finds given word forms', () => {
    const hits = searchForms(texts, new Set(['كتبت']));
    expect(hits.map((h) => h.match)).toEqual(['كَتَبْتُ']);
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
