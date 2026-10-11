// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chapterText } from './chapterHtml';
import { cleanOffsetForCfi, pointForCfi } from './epubPosition';
import { extractChapter, type CleanChapter } from './parseCleanEpub';

const xhtml = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>\n<body>\n  ${body}\n</body></html>`;

/** A clean chapter from `html` at spine index 3 (CFIs below start /6/8), and its text as the reader has it. */
function chapterOf(html: string): { chapter: CleanChapter; text: string } {
  const { blocks } = extractChapter(html);
  const chapter: CleanChapter = { title: 'الفصل 4', blocks, href: 'c3.xhtml', spineIndex: 3 };
  return { chapter, text: chapterText(chapter, { notes: true }) };
}

describe('Original-layout positions in the clean text', () => {
  const html = xhtml('<h1>الباب الأول</h1>\n  <p>قال <b>ابن</b> خلدون: العصبية هي الرابطة.</p>\n  <p>ثم إن الملك غاية للعصبية.</p>');

  it('walks a CFI path to its text node, past whitespace between elements', () => {
    const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    const point = pointForCfi(doc, 'epubcfi(/6/8!/4/6/1:3)');
    expect(point?.node.textContent).toBe('ثم إن الملك غاية للعصبية.');
    expect(point?.offset).toBe(3);
    expect(pointForCfi(doc, 'epubcfi(/6/8!/4/40/1:0)')).toBeNull();
  });

  it('lands a bookmark on the same word, not the chapter start', () => {
    const { chapter, text } = chapterOf(html);
    // The second paragraph, at "إن".
    const offset = cleanOffsetForCfi(chapter, text, html, 'epubcfi(/6/8!/4/6/1:3)')!;
    expect(text.slice(offset, offset + 2)).toBe('إن');
    // Inside the first paragraph, after an inline element: "خلدون".
    const after = cleanOffsetForCfi(chapter, text, html, 'epubcfi(/6/8!/4/4/3:1)')!;
    expect(text.slice(after, after + 5)).toBe('خلدون');
  });

  it('reads the start of a range CFI', () => {
    const { chapter, text } = chapterOf(html);
    const offset = cleanOffsetForCfi(chapter, text, html, 'epubcfi(/6/8!/4/6,/1:3,/1:5)')!;
    expect(text.slice(offset, offset + 2)).toBe('إن');
  });

  it('skips the made-up title of a chapter without a heading', () => {
    const plain = xhtml('<p>أول الكلام</p>\n  <p>آخر الكلام</p>');
    const { chapter, text } = chapterOf(plain);
    expect(text.startsWith('الفصل 4')).toBe(true);
    const offset = cleanOffsetForCfi(chapter, text, plain, 'epubcfi(/6/8!/4/4/1:0)')!;
    expect(text.slice(offset, offset + 3)).toBe('آخر');
  });

  it('gives up on another spine item or a path that does not resolve', () => {
    const { chapter, text } = chapterOf(html);
    expect(cleanOffsetForCfi(chapter, text, html, 'epubcfi(/6/10!/4/6/1:3)')).toBeNull();
    expect(cleanOffsetForCfi(chapter, text, html, 'epubcfi(/6/8!/4/99/1:0)')).toBeNull();
    expect(cleanOffsetForCfi(chapter, text, html, 'clean:1:2:3')).toBeNull();
  });
});
