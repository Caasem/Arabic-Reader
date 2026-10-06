import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { arabicShare, decodeText, paragraphsToHtml, splitTextChapters } from './text';
import { writeEpub } from './epubWriter';

const ARABIC = 'بسم الله الرحمن الرحيم. هذا كتاب صغير للتجربة.';

describe('decodeText', () => {
  it('reads UTF-8 with and without a byte-order mark', () => {
    const plain = new TextEncoder().encode(ARABIC);
    expect(decodeText(plain)).toMatchObject({ text: ARABIC, encoding: 'utf-8', lossy: false });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...plain])).text).toBe(ARABIC);
  });

  it('reads UTF-16 by its byte-order mark', () => {
    const le = new Uint8Array(2 + ARABIC.length * 2);
    le.set([0xff, 0xfe]);
    for (let i = 0; i < ARABIC.length; i++) new DataView(le.buffer).setUint16(2 + i * 2, ARABIC.charCodeAt(i), true);
    expect(decodeText(le)).toMatchObject({ text: ARABIC, encoding: 'utf-16le' });
  });

  it('falls back to Windows-1256 for old Arabic Windows text', () => {
    // "سلام عليكم" in Windows-1256.
    const bytes = new Uint8Array([0xd3, 0xe1, 0xc7, 0xe3, 0x20, 0xda, 0xe1, 0xed, 0xdf, 0xe3]);
    expect(decodeText(bytes)).toMatchObject({ text: 'سلام عليكم', encoding: 'windows-1256', lossy: false });
  });
});

describe('arabicShare', () => {
  it('counts letters only', () => {
    expect(arabicShare('سلام 123 !!!')).toBe(1);
    expect(arabicShare('hello سلام')).toBeCloseTo(4 / 9);
    expect(arabicShare('123')).toBe(0);
  });
});

describe('splitTextChapters', () => {
  it('takes the first short line as the title and splits at heading words', () => {
    const text = ['رياض الصالحين', 'الباب الأول: الإخلاص', 'نص الباب الأول.\nسطر ثان.', 'الباب الثاني: التوبة', 'نص الباب الثاني.'].join('\n\n');
    const { title, chapters } = splitTextChapters(text, 'file');
    expect(title).toBe('رياض الصالحين');
    expect(chapters.map((c) => c.title)).toEqual(['الباب الأول: الإخلاص', 'الباب الثاني: التوبة']);
    expect(chapters[0].paragraphs).toEqual(['نص الباب الأول.\nسطر ثان.']);
  });

  it('splits into parts of about 5,000 words when there are fewer than two headings', () => {
    const para = Array(1000).fill('كلمة').join(' ');
    const text = ['عنوان الكتاب', ...Array(12).fill(para)].join('\n\n');
    const { chapters } = splitTextChapters(text, 'file');
    expect(chapters.map((c) => c.title)).toEqual(['Part 1', 'Part 2', 'Part 3']);
  });

  it('uses the file name when the first line is long', () => {
    const { title, chapters } = splitTextChapters('x'.repeat(200) + '\n\nmore', 'my-file');
    expect(title).toBe('my-file');
    expect(chapters).toHaveLength(1);
  });
});

describe('paragraphsToHtml', () => {
  it('keeps line breaks and escapes markup', () => {
    expect(paragraphsToHtml(['a <b>\nc & d'])).toBe('<p>a &lt;b&gt;<br/>c &amp; d</p>');
  });
});

describe('writeEpub', () => {
  it('writes a right-to-left EPUB with a chapter per entry and a table of contents', async () => {
    const blob = await writeEpub({
      title: 'كتاب',
      author: 'مؤلف',
      language: 'ar',
      rtl: true,
      chapters: [
        { title: 'الأول', html: '<p>أ</p>' },
        { title: 'الثاني', html: '<p>ب</p>' },
      ],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>كتاب</dc:title>');
    expect(opf).toContain('<dc:creator>مؤلف</dc:creator>');
    expect(opf).toContain('page-progression-direction="rtl"');
    expect(await zip.file('OEBPS/chapter-0002.xhtml')!.async('string')).toContain('dir="rtl"');
    expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('الثاني');
  });

  it('refuses a book with no chapters', async () => {
    await expect(writeEpub({ title: 't', language: 'en', rtl: false, chapters: [] })).rejects.toThrow('no text');
  });
});
