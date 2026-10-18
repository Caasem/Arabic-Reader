// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { documentBlocks } from '../studyDesk/docExport';
import { embedHtml } from '../studyDesk/docHtml';
import { exportFormats, registerExportFormat } from '../studyDesk/exportFormats';
import type { Desk, DeskItem } from '../studyDesk/types';
import { registerThinkingExports, toNotion, toObsidian } from './exportFormats';

const item = (id: string, extra: Partial<DeskItem>): DeskItem => ({ id, deskId: 'd', type: 'concept', text: '', inInbox: true, createdAt: 0, updatedAt: 0, ...extra });
const pdf = { bookId: 'b1', bookTitle: 'Muqaddima', location: 'pdf:62:0.1:0.2:0.5:0.1', chapterLabel: 'Page 62' };
const clean = { bookId: 'b2', bookTitle: 'Kitab', location: 'clean:2:10:40', chapterLabel: 'On method' };
const all = [
  item('q1', { type: 'quote', text: 'الظلم مؤذن بخراب العمران', ar: true, move: 'claim', source: pdf }),
  item('q2', { type: 'quote', text: 'A second line\nof a quote', source: clean }),
  item('q3', { type: 'quote', text: 'No place', source: { bookId: 'b3', bookTitle: 'Loose' } }),
  item('q4', { type: 'quote', text: 'Unlabelled', source: { bookId: 'b2', bookTitle: 'Kitab', location: 'clean:4:0:5' } }),
  item('n1', { type: 'note', text: '', body: 'I think so\nreally', links: ['q2', 'missing'] }),
  item('m1', { type: 'question', text: 'Why does it fall?', source: pdf }),
  item('m2', { type: 'question', text: 'What is asabiyya?', answer: 'q1', answeredAt: 5 }),
  item('c1', { type: 'concept', text: 'Group feeling', body: 'asabiyya' }),
];
const items = new Map(all.map((i) => [i.id, i]));
const html = `<h3>Plan</h3><p>Words</p>${all.map((i) => embedHtml(i.id)).join('')}`;
const blocks = documentBlocks(html, items, () => true);
const thread: Desk = { id: 't', kind: 'thread', title: 'Injustice', titleAr: 'الظلم', question: 'What undoes a state?', html: '', createdAt: 0, updatedAt: 0 };
const NOW = Date.UTC(2026, 9, 12);

describe('Obsidian export', () => {
  const md = toObsidian({ title: 'Injustice', blocks, desk: thread, items }, NOW);

  it('starts with front matter and a heading with the question', () => {
    expect(md.startsWith('---\ntitle: "Injustice"\nkind: thread\nquestion: "What undoes a state?"\ntags: [arabic-reader, thread]\nexported: 2026-10-12\n---\n\n')).toBe(true);
    expect(md).toContain('# الظلم · Injustice\n\n> What undoes a state?\n\n## Plan');
  });

  it('escapes quotes and backslashes in front matter, and uses desk tags for other desks', () => {
    const own: Desk = { ...thread, kind: 'own', question: undefined, titleAr: undefined };
    const out = toObsidian({ title: 'A "quoted" \\ title', blocks: [], desk: own }, NOW);
    expect(out).toContain('title: "A \\"quoted\\" \\\\ title"');
    expect(out).toContain('kind: own\ntags: [arabic-reader, desk]');
    expect(out).not.toContain('question:');
    expect(toObsidian({ title: 'No desk', blocks: [] }, NOW)).toContain('kind: own');
  });

  it('cites a PDF quote with its page, and tags its move', () => {
    expect(md).toContain('> الظلم مؤذن بخراب العمران\n>\n> — Muqaddima, p. 62 · [[Muqaddima#p. 62]] #claim');
  });

  it('cites a clean quote with its chapter, a numbered chapter, or just the book', () => {
    expect(md).toContain('> A second line\n> of a quote\n>\n> — Kitab, On method · [[Kitab#On method]]');
    expect(md).toContain('> — Kitab, ch. 5 · [[Kitab#ch. 5]]');
    expect(md).toContain('> — Loose · [[Loose]]');
  });

  it('writes thoughts with backlinks to the thoughts they link, skipping missing ones', () => {
    expect(md).toContain('**My note:** I think so  \nreally\n\nLinked: [[Kitab#On method|“A second line of a quote”]]\n');
    expect(md).not.toContain('missing');
  });

  it('writes open and answered masāʾil as to-dos, with the answering passage', () => {
    expect(md).toContain('- [ ] **Masʾala:** Why does it fall?');
    expect(md).toContain('- [x] **Masʾala:** What is asabiyya?\n\n  > الظلم مؤذن بخراب العمران\n  >\n  > — Muqaddima, p. 62 · [[Muqaddima#p. 62]]');
  });

  it('leaves concepts as in Markdown and does not let text make wiki links', () => {
    expect(md).toContain('**Group feeling** — asabiyya');
    const para = documentBlocks('<p>see [[Other]]</p>', new Map(), () => true);
    expect(toObsidian({ title: 'x', blocks: para }, NOW)).toContain('see \\[\\[Other\\]\\]');
  });
});

describe('Notion export', () => {
  const md = toNotion({ title: 'Injustice', blocks, desk: thread, items });

  it('has no front matter and no wiki links', () => {
    expect(md.startsWith('# Injustice\n\n> **Question:** What undoes a state?\n\n## Plan')).toBe(true);
    expect(md).not.toContain('---');
    expect(md).not.toContain('[[');
    expect(md).not.toContain('#claim');
  });

  it('writes quotes with plain citations', () => {
    expect(md).toContain('> الظلم مؤذن بخراب العمران\n>\n> — Muqaddima, p. 62\n');
    expect(md).toContain('> — Kitab, On method');
  });

  it('writes thoughts as paragraphs and masāʾil as to-dos', () => {
    expect(md).toContain('\n\nI think so  \nreally\n\n');
    expect(md).not.toContain('My note');
    expect(md).toContain('- [ ] Why does it fall?');
    expect(md).toContain('- [x] What is asabiyya?\n\n  > الظلم مؤذن بخراب العمران\n  >\n  > — Muqaddima, p. 62\n');
  });
});

describe('export format registry', () => {
  it('registers, lists in order, replaces by id and unregisters', () => {
    const before = exportFormats().length;
    const off = registerExportFormat({ id: 'x', label: 'X', ext: 'x', make: () => 'one', savedMessage: 'Saved' });
    expect(exportFormats().map((f) => f.id)).toContain('x');
    const off2 = registerExportFormat({ id: 'x', label: 'X2', ext: 'x', make: () => 'two', savedMessage: 'Saved' });
    expect(exportFormats()).toHaveLength(before + 1);
    expect(exportFormats().find((f) => f.id === 'x')?.label).toBe('X2');
    // The first registration was replaced, so its unregister leaves the new one.
    off();
    expect(exportFormats().find((f) => f.id === 'x')?.label).toBe('X2');
    off2();
    expect(exportFormats()).toHaveLength(before);
  });

  it('registers and unregisters both thinking formats', () => {
    const off = registerThinkingExports();
    expect(exportFormats().map((f) => f.id)).toEqual(expect.arrayContaining(['obsidian', 'notion']));
    expect(exportFormats().find((f) => f.id === 'obsidian')).toMatchObject({ label: 'Save for Obsidian', ext: 'md', savedMessage: 'Saved for Obsidian' });
    expect(
      exportFormats()
        .find((f) => f.id === 'notion')
        ?.make({ title: 'T', blocks: [] })
    ).toBe('# T\n');
    off();
    expect(exportFormats().map((f) => f.id)).not.toContain('obsidian');
    expect(exportFormats().map((f) => f.id)).not.toContain('notion');
  });
});
