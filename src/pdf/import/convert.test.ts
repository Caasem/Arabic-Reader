// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { convertToEpub } from '../../importFormats';
import { convertPdf, MAX_PDF_BYTES, PDF_MESSAGES, PdfImportError, type PdfDeps } from './convert';
import { arabicTokens, assessText } from './quality';
import { lineWidth, makePdf, PAGE_HEIGHT, PAGE_WIDTH, type PdfTestLine, type PdfTestPage } from '../testPdf';

// pdf.js runs in its fake-worker mode under Node.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

// Invented sentences in plain modern Arabic; the "dictionary" below knows exactly these words.
const PROSE_1 =
  'ذهب الولد الصغير إلى المدرسة في الصباح الباكر مع أخيه الكبير وكان الطريق طويلا بين البيوت القديمة والأشجار العالية وقرأ الولد كتابا جديدا عن الحيوانات في الغابة الكبيرة.';
const PROSE_2 =
  'رجع الولد إلى البيت بعد الظهر وجلس مع أمه في الحديقة الجميلة وحكى لها قصة الكتاب الجديد وضحكت الأم كثيرا من الحيوانات الصغيرة في القصة.';
const PROSE_3 = 'كتب الطالب الدرس الأول في دفتره ثم قرأ الجملة الطويلة بصوت عال أمام المعلم والأصدقاء في الصف الكبير حتى فهم الجميع معنى الكلمات الجديدة جيدا.';
const VERSE = ['خرج الولد من البيت القديم', 'وسار مع أخيه إلى المدرسة', 'قرأ الكتاب في الصباح الباكر', 'ورجع إلى أمه في الحديقة'];

const KNOWN = new Set([PROSE_1, PROSE_2, PROSE_3, ...VERSE, 'الفصل الأول', 'الفصل الثاني', 'كتاب التجربة', 'مقدمة'].flatMap(arabicTokens));
const analyse = async (words: string[]) => new Set(words.filter((w) => KNOWN.has(w)));

async function openDocument(data: Uint8Array) {
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  return {
    numPages: doc.numPages,
    getPage: (n: number) => doc.getPage(n),
    getMetadata: () => doc.getMetadata(),
    destroy: () => task.destroy(),
  };
}
const deps: PdfDeps = { openDocument, analyse };

const RIGHT = 540;
const rtl = (text: string, y: number, extra: Partial<PdfTestLine> = {}): PdfTestLine => ({ text, x: RIGHT, y, rtl: true, ...extra });

/** Greedy wrap of `text` into lines of at most `max` characters. */
function wrap(text: string, max = 56): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line];
}

/** A paragraph from the top `y`, first line indented; returns its lines and the y below it. */
function paragraph(text: string, y: number, { indent = true, order = 'visual' }: { indent?: boolean; order?: 'visual' | 'logical' } = {}): { lines: PdfTestLine[]; y: number } {
  const lines = wrap(text).map((t, i) => rtl(t, y - i * 18, { x: i === 0 && indent ? RIGHT - 24 : RIGHT, order }));
  return { lines, y: y - lines.length * 18 };
}

const header = (): PdfTestLine => rtl('كتاب التجربة', 800);
const pageNumber = (n: number): PdfTestLine => ({ text: String(n), x: PAGE_WIDTH / 2, y: 30 });

/** Three pages: two chapters, a paragraph running over a page break, running heads and a poem. */
function bookPages(order: 'visual' | 'logical' = 'visual'): PdfTestPage[] {
  const p1 = paragraph(PROSE_1, 690, { order });
  const p2 = paragraph(PROSE_2, p1.y - 14, { order });
  const page1: PdfTestPage = { lines: [header(), pageNumber(1), rtl('الفصل الأول', 720, { size: 22, order }), ...p1.lines, ...p2.lines] };

  const verse = VERSE.map((t, i) => rtl(t, 470 - i * 18, { x: PAGE_WIDTH / 2 + lineWidth(t) / 2, order }));
  const page2: PdfTestPage = {
    lines: [header(), pageNumber(2), rtl('الفصل الثاني', 720, { size: 22, order }), ...paragraph(PROSE_3, 690, { order }).lines, ...verse, rtl('مقدمة', 380, { size: 16, order })],
  };
  const p4 = paragraph(PROSE_1, 690, { order });
  const page3: PdfTestPage = { lines: [header(), pageNumber(3), ...p4.lines] };
  return [page1, page2, page3];
}

const textOf = (chapter: { html: string }) => chapter.html.replace(/<br\/>/g, '\n').replace(/<[^>]+>/g, '');

describe('convertPdf', () => {
  it('reflows clean Arabic text into chapters, joined paragraphs and verse, without running heads', async () => {
    const book = await convertPdf(makePdf(bookPages()), deps, 'fallback');
    expect(book.rtl).toBe(true);
    expect(book.pages).toBe(3);
    expect(book.chapters.map((c) => c.title)).toEqual(['الفصل الأول', 'الفصل الثاني']);
    const [one, two] = book.chapters;

    // Lines of a paragraph are joined back into the sentence, in order.
    expect(one.html).toContain(`<p>${PROSE_1}</p>`);
    expect(one.html).toContain(`<p>${PROSE_2}</p>`);
    expect(one.html.indexOf(PROSE_1)).toBeLessThan(one.html.indexOf(PROSE_2));

    // The poem keeps its lines.
    expect(two.html).toContain(`<p>${VERSE.join('<br/>')}</p>`);
    expect(two.html).toContain(`<p>${PROSE_3}</p>`);
    // A smaller heading inside a chapter stays in it.
    expect(two.html).toContain('<h3>مقدمة</h3>');

    // The title that repeats on every page and the page numbers are gone.
    const all = book.chapters.map(textOf).join('\n');
    expect(all).not.toContain('كتاب التجربة');
    expect(all).not.toMatch(/^[0-9]+$/m);
    expect(book.quality!).toMatchObject({ verdict: 'ok', presentationShare: 0 });
    expect(book.quality!.analysedShare).toBeGreaterThanOrEqual(0.7);
    // Page 3 has no heading of its own: it belongs to the second chapter.
    expect(two.html.match(/<p>/g)!.length).toBe(3);
  });

  it('joins a paragraph that runs over a page break', async () => {
    const long = `${PROSE_3.replace(/\.$/, '')} ${PROSE_2}`;
    const lines = wrap(long);
    const cut = Math.ceil(lines.length / 2);
    const at = (ls: string[]): PdfTestLine[] => ls.map((t, i) => rtl(t, 700 - i * 18));
    const pages: PdfTestPage[] = [
      { lines: [header(), pageNumber(1), ...at(lines.slice(0, cut))] },
      { lines: [header(), pageNumber(2), ...at(lines.slice(cut))] },
      { lines: [header(), pageNumber(3), ...paragraph(PROSE_1, 700).lines] },
    ];
    const html = (await convertPdf(makePdf(pages), deps, 'x')).chapters[0].html;
    expect(html).toBe(`<p>${long}</p>
<p>${PROSE_1}</p>`);
  });

  it('reads text stored as presentation forms and normalises it to plain letters', async () => {
    const isolated = new Map<string, string>();
    for (let cp = 0xfe70; cp <= 0xfefc; cp++) {
      const ch = String.fromCodePoint(cp);
      const base = ch.normalize('NFKC');
      if ([...base].length === 1 && base !== ch && !isolated.has(base)) isolated.set(base, ch);
    }
    const shape = (s: string) => [...s].map((c) => isolated.get(c) ?? c).join('');
    const pages = bookPages().map((p) => ({ ...p, lines: p.lines?.map((l) => (l.rtl ? { ...l, text: shape(l.text) } : l)) }));
    const book = await convertPdf(makePdf(pages), deps, 'x');
    expect(book.quality!.presentationShare).toBeGreaterThan(0.8);
    expect(book.quality!.verdict).toBe('ok');
    expect(book.chapters[0].html).toContain(PROSE_1);
    expect(book.chapters[0].html).not.toMatch(/[ﭐ-﷿ﹰ-﻿]/);
  });

  it('keeps text stored in reversed order as pages only, and says so in the quality report', async () => {
    const book = await convertPdf(makePdf(bookPages('logical')), deps, 'x');
    expect(book).toMatchObject({ reflow: 'broken', chapters: [], notice: PDF_MESSAGES.broken, pages: 3 });
    expect(book.quality?.verdict).toBe('reversed');

    // The check itself: reversed words analyse as words once turned round.
    const reversed = [...PROSE_1].reverse().join('');
    const report = await assessText(reversed, analyse);
    expect(report.verdict).toBe('reversed');
    expect(report.analysedShare).toBeLessThan(0.2);
    expect(report.reversedShare).toBeGreaterThan(0.9);
  });

  it('keeps text whose words do not analyse as pages only', async () => {
    const gibberish = 'ثخذ ضظغ ظثخ غذض ثظخ ذغض خثظ ضغذ ظخث غضذ ثذخ ضظث ظغخ';
    const pages: PdfTestPage[] = [0, 1, 2].map(() => ({ lines: wrap(gibberish.repeat(3), 56).map((t, i) => rtl(t, 700 - i * 18)) }));
    const book = await convertPdf(makePdf(pages), deps, 'x');
    expect(book).toMatchObject({ reflow: 'broken', chapters: [] });
    expect(book.quality?.verdict).toBe('broken');
  });

  it('keeps a scanned PDF (images, no text layer) as pages only', async () => {
    const book = await convertPdf(makePdf([{ image: true }, { image: true }, { image: true }]), deps, 'x');
    expect(book).toMatchObject({ reflow: 'none', chapters: [], notice: PDF_MESSAGES.scanned, pages: 3 });
  });

  it('converts the text pages of a mixed PDF and reports the pages it left out', async () => {
    const pages = bookPages();
    const book = await convertPdf(makePdf([pages[0], { image: true }, pages[1], pages[2]]), deps, 'x');
    expect(book.warnings).toEqual(['1 page without text left out']);
    expect(book.pages).toBe(4);
  });

  it('still accepts the PDF when a page cannot be read or the dictionary check fails', async () => {
    const pdf = makePdf(bookPages());
    const flaky: PdfDeps = {
      ...deps,
      openDocument: async (data) => {
        const doc = await openDocument(data);
        return { ...doc, getPage: (n: number) => (n === 2 ? Promise.reject(new Error('bad page')) : doc.getPage(n)) };
      },
    };
    const partial = await convertPdf(pdf, flaky, 'x');
    expect(partial.pages).toBe(3);
    expect(partial.reflow).toBe('ok');
    expect(partial.warnings).toEqual(['1 page without text left out']);

    const noDictionary = await convertPdf(pdf, { ...deps, analyse: () => Promise.reject(new Error('no dictionary')) }, 'x');
    expect(noDictionary).toMatchObject({ reflow: 'broken', chapters: [], pages: 3 });
  });

  it('explains an encrypted, a corrupt and a too-large PDF', async () => {
    const encrypted = makePdf([{ lines: [rtl(PROSE_1, 700)] }], { encrypted: true });
    await expect(convertPdf(encrypted, deps, 'x')).rejects.toThrow(PDF_MESSAGES.password);
    await expect(convertPdf(new TextEncoder().encode('this is not a pdf'), deps, 'x')).rejects.toThrow(PDF_MESSAGES.corrupt);
    await expect(convertPdf({ length: MAX_PDF_BYTES + 1 } as Uint8Array, deps, 'x')).rejects.toThrow(PDF_MESSAGES.tooLarge);
    await expect(convertPdf(new Uint8Array(0), deps, 'x')).rejects.toBeInstanceOf(PdfImportError);
  });

  it('cuts a book without headings into parts and takes the title from the PDF', async () => {
    const lines = wrap(`${PROSE_1} ${PROSE_2} ${PROSE_3}`, 56).map((t, i) => rtl(t, 700 - i * 18, { x: RIGHT }));
    const pages: PdfTestPage[] = [{ lines }, { lines }, { lines }];
    const book = await convertPdf(makePdf(pages, { title: 'كتاب الحديقة' }), deps, 'x');
    expect(book.title).toBe('كتاب الحديقة');
    expect(book.chapters.map((c) => c.title)).toEqual(['كتاب الحديقة']);
  });

  it('reads left-to-right text too, without testing it against the Arabic dictionary', async () => {
    const text = 'The quick brown fox jumps over the lazy dog while the reader turns the page and keeps going';
    const lines = wrap(text, 50).map((t, i): PdfTestLine => ({ text: t, x: 60, y: 700 - i * 18 }));
    const book = await convertPdf(makePdf([{ lines }, { lines }, { lines }]), deps, 'x');
    expect(book.rtl).toBe(false);
    expect(book.chapters[0].html).toContain(text);
  });
});

describe('convertToEpub with a PDF', () => {
  it('builds an EPUB with a chapter per heading and records the page count', async () => {
    const file = new File([makePdf(bookPages()) as BlobPart], 'تجربة.pdf', { type: 'application/pdf' });
    const converted = await convertToEpub(file, { loadPdfDeps: async () => deps });
    expect(converted).toMatchObject({ format: 'pdf', chapters: 2, pages: 3, pdf: { pages: 3, reflow: 'ok' }, warnings: [] });
    expect(converted.original).toBe(file);
    expect(converted.epub.name).toBe('تجربة.epub');
    const zip = await JSZip.loadAsync(await converted.epub.arrayBuffer());
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:language>ar</dc:language>');
    expect(await zip.file('OEBPS/chapter-0001.xhtml')!.async('string')).toContain(PROSE_1);
  });
});

describe('convertToEpub with a pages-only PDF', () => {
  it('builds a one-page stand-in book that carries the reason', async () => {
    const file = new File([makePdf([{ image: true }, { image: true }]) as BlobPart], 'scan.pdf', { type: 'application/pdf' });
    const converted = await convertToEpub(file, { loadPdfDeps: async () => deps });
    expect(converted).toMatchObject({ chapters: 1, pages: 2, pdf: { pages: 2, reflow: 'none' }, warnings: [PDF_MESSAGES.scanned] });
    const zip = await JSZip.loadAsync(await converted.epub.arrayBuffer());
    expect(await zip.file('OEBPS/chapter-0001.xhtml')!.async('string')).toContain('scanned images');
  });
});

describe('the fixture writer', () => {
  it('lays text out inside the page', () => {
    expect(lineWidth('abcd', 10)).toBe(20);
    expect(PAGE_HEIGHT).toBeGreaterThan(PAGE_WIDTH);
  });
});
