// @vitest-environment jsdom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { documentBlocks, exportFileName, toMarkdown, toPlainText } from './docExport';
import { embedHtml } from './docHtml';
import { toDocx } from './docxExport';
import type { DeskItem } from './types';

const item = (id: string, extra: Partial<DeskItem>): DeskItem => ({ id, deskId: 'd', type: 'concept', text: '', inInbox: true, createdAt: 0, updatedAt: 0, ...extra });
const items = new Map(
  [
    item('q', { type: 'quote', text: 'كان هناك رجل قوي', ar: true, body: 'The opening line', source: { bookId: 'b', bookTitle: 'قرية الفتى', chapterLabel: 'Chapter 1' } }),
    item('c', { type: 'concept', text: 'Group feeling', body: 'asabiyya' }),
    item('h', { type: 'concept', text: 'Hidden one', hidden: true }),
    item('s', { type: 'capture', text: 'Region of page 3', imageHash: 'img', source: { bookId: 'p', bookTitle: 'Scan', chapterLabel: 'Page 3' } }),
  ].map((i) => [i.id, i])
);
const html = `<h3>Notes</h3><p>Plain and <b>bold</b> *star*</p>${embedHtml('q')}${embedHtml('c')}${embedHtml('h')}<ul><li>one</li><li>two</li></ul><blockquote>my saying</blockquote>${embedHtml('s')}<p><br></p>`;
const blocks = () => documentBlocks(html, items, (i) => !i.hidden);

describe('desk document export', () => {
  it('reads the document into blocks, leaving out hidden items and empty lines', () => {
    expect(blocks().map((b) => (b.kind === 'item' ? `item:${b.item.id}` : b.kind))).toEqual(['heading', 'para', 'item:q', 'item:c', 'list', 'quote', 'item:s']);
  });

  it('writes Markdown with citations, formatting and escaped stars', () => {
    const md = toMarkdown('My desk', blocks());
    expect(md).toContain('# My desk\n\n## Notes');
    expect(md).toContain('Plain and **bold** \\*star\\*');
    expect(md).toContain('> كان هناك رجل قوي\n>\n> — قرية الفتى, Chapter 1\n\nThe opening line');
    expect(md).toContain('**Group feeling** — asabiyya');
    expect(md).toContain('- one\n- two');
    expect(md).toContain('> my saying');
    expect(md).toContain('*[Screenshot]* (Scan, Page 3)');
    expect(md).not.toContain('Hidden one');
  });

  it('writes plain text for the clipboard', () => {
    const t = toPlainText('My desk', blocks());
    expect(t).toContain('“كان هناك رجل قوي” (قرية الفتى, Chapter 1)');
    expect(t).toContain('• one\n• two');
  });

  it('writes a Word file with the text, right-to-left Arabic and the screenshot', async () => {
    const blob = await toDocx('My desk', blocks(), async (hash) => (hash === 'img' ? new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) : undefined));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    // Well-formed: Word refuses a file whose XML does not parse.
    for (const name of ['word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml', '_rels/.rels']) {
      const parsed = new DOMParser().parseFromString(await zip.file(name)!.async('string'), 'application/xml');
      expect(parsed.getElementsByTagName('parsererror').length, name).toBe(0);
    }
    expect(xml).toContain('Group feeling');
    expect(xml).toContain('— قرية الفتى, Chapter 1');
    expect(xml).toMatch(/<w:bidi\/>.*كان هناك رجل قوي/);
    expect(xml).toContain('r:embed="rIdImg1"');
    expect(zip.file('word/media/image1.png')).toBeTruthy();
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('media/image1.png');
  });

  it('names files after the desk, Arabic included', () => {
    expect(exportFileName('قرية الفتى: notes?', 'md')).toBe('قرية الفتى notes.md');
    expect(exportFileName('', 'docx')).toBe('Desk.docx');
  });
});
