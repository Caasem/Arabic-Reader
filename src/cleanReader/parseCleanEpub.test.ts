// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chapterHtml, chapterText } from './chapterHtml';
import { NOTE_CLOSE, NOTE_OPEN, extractBlocks, extractChapter, parseCleanEpub } from './parseCleanEpub';

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

describe('extractChapter', () => {
  it('keeps a footnote marker in the text and reads a same-file note', () => {
    const { blocks, notes } = extractChapter(
      '<body><p>خير جليس<a epub:type="noteref" href="#n1">١</a> كتاب</p><aside id="n1" epub:type="footnote"><p>من بيت للمتنبي.</p></aside></body>'
    );
    expect(blocks[0]).toEqual({ t: 'p', s: `خير جليس${NOTE_OPEN}0${NOTE_CLOSE} كتاب` });
    expect(notes).toEqual([{ label: '١', href: '#n1', text: 'من بيت للمتنبي.' }]);
  });

  it('reads the paragraph around a bare back-link anchor', () => {
    const { notes } = extractChapter('<body><p>نص<a href="#fn2">2</a></p><p><a id="fn2" href="#r2">2</a> شرح الحاشية هنا.</p></body>');
    expect(notes[0].text).toBe('2 شرح الحاشية هنا.');
  });
});

describe('chapterHtml', () => {
  it('escapes text so book content cannot inject markup', () => {
    const html = chapterHtml({ title: 't', blocks: [{ t: 'p', s: '<img src=x onerror=evil()> & more' }] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=evil()&gt; &amp; more');
  });

  it('renders note markers as buttons only when asked', () => {
    const chapter = { title: 't', blocks: [{ t: 'p' as const, s: `أ${NOTE_OPEN}0${NOTE_CLOSE} ب` }], notes: [{ label: '1', text: 'note' }] };
    expect(chapterHtml(chapter)).toContain('<p>أ ب</p>');
    expect(chapterHtml(chapter, { notes: true })).toContain('data-note="0"');
  });

  it('has the same text as its rendered markup, so offsets line up', () => {
    const chapter = {
      title: 'عنوان',
      blocks: [
        { t: 'h' as const, l: 1, s: 'الفصل' },
        { t: 'p' as const, s: `سطر<&>${NOTE_OPEN}0${NOTE_CLOSE}\nآخر` },
        { t: 'brk' as const },
        { t: 'gap' as const },
        { t: 'h' as const, l: 2, s: 'قسم' },
      ],
      notes: [{ label: '[٣]', text: 'x' }],
    };
    for (const notes of [false, true]) {
      const div = document.createElement('div');
      div.innerHTML = chapterHtml(chapter, { notes });
      expect(div.textContent).toBe(chapterText(chapter, { notes }));
    }
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
    expect(book.chapters.map((c) => [c.href, c.spineIndex])).toEqual([
      ['c0.xhtml', 0],
      ['c2.xhtml', 2],
    ]);
  });

  it('reads notes kept in another file', async () => {
    const blob = await buildEpub(['<p>نص<a epub:type="noteref" href="c1.xhtml#e1">1</a></p>', '<aside id="e1"><p>حاشية في ملف آخر.</p></aside>']);
    const book = await parseCleanEpub(blob);
    expect(book.chapters[0].notes).toEqual([{ label: '1', text: 'حاشية في ملف آخر.' }]);
  });

  it('rejects a file that is not an epub', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(parseCleanEpub(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/valid EPUB/);
  });
});
