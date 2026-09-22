// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chapterHtml } from './chapterHtml';
import { extractBlocks, parseCleanEpub } from './parseCleanEpub';

describe('extractBlocks', () => {
  it('keeps text, drops scripts, images, and footnote markers', () => {
    const blocks = extractBlocks(
      '<body><h2>الفصل الأول</h2><p>كان <b>يا</b> ما كان<a epub:type="noteref" href="#n1">1</a></p><img src="x.png"/><script>evil()</script></body>'
    );
    expect(blocks).toEqual([
      { t: 'h', l: 2, s: 'الفصل الأول' },
      { t: 'p', s: 'كان يا ما كان' },
    ]);
  });

  it('turns rule lines and star rows into scene breaks and collapses blank gaps', () => {
    const blocks = extractBlocks('<body><p>أ</p><p></p><p></p><p>* * *</p><p></p><p>ب</p></body>');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'gap', 'brk', 'p']);
  });

  it('treats a <br> as a line break inside a paragraph', () => {
    expect(extractBlocks('<body><p>سطر<br/>آخر</p></body>')).toEqual([{ t: 'p', s: 'سطر\nآخر' }]);
  });
});

describe('chapterHtml', () => {
  it('escapes text so book content cannot inject markup', () => {
    const html = chapterHtml({ title: 't', blocks: [{ t: 'p', s: '<img src=x onerror=evil()> & more' }] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=evil()&gt; &amp; more');
  });
});

async function buildEpub(chapters: string[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
  );
  const manifest = chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('');
  zip.file(
    'OEBPS/content.opf',
    `<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>رواية</dc:title></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`
  );
  chapters.forEach((body, i) => zip.file(`OEBPS/c${i}.xhtml`, `<html><body>${body}</body></html>`));
  return zip.generateAsync({ type: 'blob' });
}

describe('parseCleanEpub', () => {
  it('reads the spine into titled chapters, skipping sections with no text', async () => {
    const blob = await buildEpub(['<h1>البداية</h1><p>نص</p>', '<img src="cover.png"/>', '<p>بلا عنوان</p>']);
    const book = await parseCleanEpub(blob);
    expect(book.title).toBe('رواية');
    expect(book.chapters.map((c) => c.title)).toEqual(['البداية', 'الفصل 2']);
  });

  it('rejects a file that is not an epub', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(parseCleanEpub(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/valid EPUB/);
  });
});
