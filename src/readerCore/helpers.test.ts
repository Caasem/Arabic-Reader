// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CleanChapter } from './parseCleanEpub';
import { buildBookModel } from './bookModel';
import { searchForms, searchTexts } from './cleanSearch';
import { chapterForEpubPosition, formatCleanLocation, isCleanLocation, parseCleanLocation } from './location';

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
