// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { convertToEpub, formatOf } from './index';
import { markdownToChapters, readFrontMatter } from './markdown';
import { mobiToChapters, ProtectedBookError } from './mobi';

async function epubFiles(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (/\.(xhtml|opf|ncx)$/.test(name)) out[name] = await zip.file(name)!.async('string');
  return out;
}

/**
 * A minimal MOBI 6 file built from the format definition (PDB header, record 0 with PalmDOC and
 * MOBI headers, one uncompressed UTF-8 text record), so the converter is tested without a real book.
 */
function makeMobi(html: string, { encryption = 0 } = {}): Blob {
  const text = new TextEncoder().encode(html);
  const title = new TextEncoder().encode('كتاب تجربة');
  const record0 = new Uint8Array(248 + title.length + 4);
  const r0 = new DataView(record0.buffer);
  r0.setUint16(0, 1); // compression: none
  r0.setUint32(4, text.length);
  r0.setUint16(8, 1); // one text record
  r0.setUint16(10, 4096);
  r0.setUint16(12, encryption);
  record0.set(new TextEncoder().encode('MOBI'), 16);
  r0.setUint32(20, 232); // MOBI header length
  r0.setUint32(24, 2);
  r0.setUint32(28, 65001); // UTF-8
  r0.setUint32(32, 1234);
  r0.setUint32(36, 6); // version 6 (not KF8)
  r0.setUint32(84, 248); // title offset
  r0.setUint32(88, title.length);
  r0.setUint32(108, 2); // first resource record
  r0.setUint32(128, 0); // no EXTH
  r0.setUint32(240, 0); // no trailing entries
  r0.setUint32(244, 0xffffffff);
  record0.set(title, 248);

  const records = [record0, text];
  const headerLength = 78 + records.length * 8 + 2;
  const pdb = new Uint8Array(headerLength + records.reduce((n, r) => n + r.length, 0));
  const view = new DataView(pdb.buffer);
  pdb.set(new TextEncoder().encode('test-book'), 0);
  pdb.set(new TextEncoder().encode('BOOKMOBI'), 60);
  view.setUint16(76, records.length);
  let offset = headerLength;
  records.forEach((r, i) => {
    view.setUint32(78 + i * 8, offset);
    pdb.set(r, offset);
    offset += r.length;
  });
  return new Blob([pdb]);
}

const MOBI_HTML =
  '<html><head><guide></guide></head><body><h2>الفصل الأول</h2><p>نص الفصل الأول.</p><script>alert(1)</script><mbp:pagebreak/><h2>الفصل الثاني</h2><p onclick="x()">نص الفصل الثاني.</p></body></html>';

describe('formatOf', () => {
  it('maps extensions to formats', () => {
    expect(['a.EPUB', 'a.txt', 'a.md', 'a.markdown', 'a.mobi', 'a.prc', 'a.azw3', 'a.azw', 'a.pdf'].map(formatOf)).toEqual([
      'epub',
      'txt',
      'md',
      'md',
      'mobi',
      'mobi',
      'azw3',
      'azw3',
      null,
    ]);
  });
});

describe('markdown', () => {
  it('reads front matter', () => {
    expect(readFrontMatter('---\ntitle: "Notes"\nauthor: Me\n---\n# Hi')).toEqual({ title: 'Notes', author: 'Me', body: '# Hi' });
  });

  it('splits at # and ## headings, keeps formatting, drops scripts and images', () => {
    const md = '# الكتاب\n\nمقدمة **مهمة**.\n\n## الفصل الأول\n\n- أ\n- ب\n\n<script>alert(1)</script>\n\n![x](http://example.com/a.png)\n\n## الفصل الثاني\n\n> قول';
    const { title, chapters, droppedImages } = markdownToChapters(md, 'file');
    expect(title).toBe('الكتاب');
    expect(chapters.map((c) => c.title)).toEqual(['الكتاب', 'الفصل الأول', 'الفصل الثاني']);
    expect(chapters[0].html).toContain('<strong>مهمة</strong>');
    expect(chapters[1].html).toContain('<li>أ</li>');
    expect(chapters.map((c) => c.html).join('')).not.toMatch(/script|example\.com/);
    expect(droppedImages).toBe(1);
  });
});

describe('mobi', () => {
  it('converts each section to a chapter and strips scripts and handlers', async () => {
    const book = await mobiToChapters(makeMobi(MOBI_HTML));
    expect(book.title).toBe('كتاب تجربة');
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters[0].html).toContain('نص الفصل الأول');
    expect(book.chapters[1].html).toContain('نص الفصل الثاني');
    expect(book.chapters.map((c) => c.html).join('')).not.toMatch(/script|onclick/);
  });

  it('refuses a DRM-protected book', async () => {
    await expect(mobiToChapters(makeMobi(MOBI_HTML, { encryption: 2 }))).rejects.toBeInstanceOf(ProtectedBookError);
  });
});

describe('convertToEpub', () => {
  it('turns a TXT file into a right-to-left EPUB with chapters', async () => {
    const text = ['رياض الصالحين', 'الباب الأول', 'نص طويل جدا في الباب الأول للتجربة.', 'الباب الثاني', 'نص طويل جدا في الباب الثاني للتجربة.'].join('\n\n');
    const result = await convertToEpub(new File([text], 'riyad.txt'));
    expect(result).toMatchObject({ format: 'txt', chapters: 2, warnings: [] });
    expect(result.epub.name).toBe('riyad.epub');
    const files = await epubFiles(result.epub);
    expect(files['OEBPS/content.opf']).toContain('<dc:title>رياض الصالحين</dc:title>');
    expect(files['OEBPS/content.opf']).toContain('<dc:language>ar</dc:language>');
    expect(files['OEBPS/chapter-0001.xhtml']).toContain('dir="rtl"');
  });

  it('turns a Markdown file into an EPUB and reports skipped images', async () => {
    const result = await convertToEpub(new File(['---\ntitle: ملاحظات\n---\n## أولا\n\nنص.\n\n![](local.png)\n\n## ثانيا\n\nنص آخر.'], 'notes.md'));
    expect(result).toMatchObject({ format: 'md', chapters: 2, warnings: ['1 image skipped'] });
    expect((await epubFiles(result.epub))['OEBPS/content.opf']).toContain('<dc:title>ملاحظات</dc:title>');
  });

  it('turns a MOBI file into an EPUB', async () => {
    const result = await convertToEpub(new File([makeMobi(MOBI_HTML)], 'book.mobi'));
    expect(result).toMatchObject({ format: 'mobi', chapters: 2 });
    expect((await epubFiles(result.epub))['OEBPS/chapter-0002.xhtml']).toContain('نص الفصل الثاني');
  });

  it('explains empty and oversized files', async () => {
    await expect(convertToEpub(new File(['   \n  '], 'empty.txt'))).rejects.toThrow('no text');
    const big = new File([new Uint8Array(51 * 1024 * 1024)], 'big.txt');
    await expect(convertToEpub(big)).rejects.toThrow('too large');
  });
});
