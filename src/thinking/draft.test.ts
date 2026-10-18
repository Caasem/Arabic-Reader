import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { buildArgument } from './argument';
import { draftBlocks, draftHtml, inDraftOrder, isBlankDoc, withDraft, type DraftBlock } from './draft';

const book = { bookId: 'b1', bookTitle: 'Iḥyāʾ' };
const clean = (a: number, b: number) => `clean:2:${a}:${b}`;
const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'd', type: 'quote', text: id, inInbox: true, createdAt: 1, updatedAt: 1, ...extra });
const passage = (id: string, from: number, extra: Partial<DeskItem> = {}) => item(id, { source: { ...book, location: clean(from, from + 10) }, ...extra });
const thought = (id: string, body: string, from: number, extra: Partial<DeskItem> = {}) =>
  item(id, { type: 'note', text: '', body, source: { ...book, location: clean(from, from + 10) }, ...extra });
const map = (items: DeskItem[]) => new Map(items.map((i) => [i.id, i]));
const arg = (members: DeskItem[]) => buildArgument(members, map(members), () => false);

describe('argument to draft', () => {
  // Claim c (a passage), objection o before evidence e in the members' order, a reply r to o, a loose evidence x,
  // a definition d, your own claim m (a thought), and thoughts on c, e and one nowhere.
  const c = passage('c', 0, { move: 'claim' });
  const o = passage('o', 100, { move: 'objection', tie: 'c' });
  const e = passage('e', 200, { move: 'evidence', tie: 'c' });
  const r = passage('r', 300, { move: 'reply', tie: 'o' });
  const x = passage('x', 400, { move: 'evidence' });
  const d = passage('d', 500, { move: 'definition' });
  const m = thought('m', 'Intention is the claim', 600, { move: 'claim' });
  const mEv = thought('me', 'Because of the hadith', 700, { move: 'evidence', tie: 'm' });
  const onC = thought('t1', 'I read this as a rule', 2);
  const onE = thought('t2', 'Strong support', 205);
  const nowhere = thought('t3', 'Unrelated', 900);
  const members = [c, o, r, e, x, d, m, mEv, onC, onE, nowhere];
  const blocks = draftBlocks(arg(members), members);

  it('writes definitions, each claim with its evidence, objections and replies, and what is not tied', () => {
    const shape = blocks.map((b) => (b.kind === 'item' ? `item:${b.id}` : `${b.kind}:${b.text}`));
    expect(shape).toEqual([
      'heading:Definitions',
      'item:d',
      'heading:c',
      'item:c',
      'para:I read this as a rule',
      'item:e',
      'para:Strong support',
      'item:o',
      'item:r',
      'heading:Intention is the claim',
      'para:Evidence: Because of the hadith',
      'heading:Not tied yet',
      'item:x',
    ]);
  });

  it('puts each thought once, and leaves out thoughts on nothing in the argument', () => {
    const paras = blocks.filter((b) => b.kind === 'para').map((b) => (b as { text: string }).text);
    expect(paras).not.toContain('Unrelated');
    expect(new Set(paras).size).toBe(paras.length);
  });

  it('puts evidence before objections, keeping the order inside each', () => {
    const kids = arg(members).claims[0].kids;
    expect(kids.map((k) => k.item.id)).toEqual(['o', 'e']);
    expect(inDraftOrder(kids).map((k) => k.item.id)).toEqual(['e', 'o']);
  });

  it('is empty when the thread has no moves', () => {
    expect(draftBlocks(arg([item('p'), onC]), [item('p'), onC])).toEqual([]);
  });

  it('gives an untitled claim a name', () => {
    const empty = thought('w', '  ', 0, { move: 'claim', text: '' });
    const b = draftBlocks(arg([empty]), [empty]);
    expect(b[0]).toEqual({ kind: 'heading', text: 'Claim' });
  });
});

describe('the draft in the document', () => {
  const blocks: DraftBlock[] = [
    { kind: 'heading', text: 'Claim <one> & "two"' },
    { kind: 'item', id: 'q-1' },
    { kind: 'para', text: 'Line one\nline two' },
  ];

  it('is headings, paragraphs and embeds, with text escaped', () => {
    expect(draftHtml(blocks)).toBe('<h3>Claim &lt;one&gt; &amp; "two"</h3><div class="desk-embed" data-item="q-1" contenteditable="false"></div><p>Line one<br>line two</p>');
  });

  it('knows a blank document from one with words or an item', () => {
    expect(isBlankDoc('<p><br></p>')).toBe(true);
    expect(isBlankDoc('')).toBe(true);
    expect(isBlankDoc('<p>&nbsp;</p><p><br></p>')).toBe(true);
    expect(isBlankDoc('<p>Notes</p>')).toBe(false);
    expect(isBlankDoc('<div class="desk-embed" data-item="a" contenteditable="false"></div><p><br></p>')).toBe(false);
  });

  it('writes a blank document as it is, with an empty line to type on', () => {
    expect(withDraft('<p><br></p>', blocks, '17 Oct 2026')).toBe(draftHtml(blocks) + '<p><br></p>');
  });

  it('adds to a document that has content, under a dated heading, after its trailing empty line', () => {
    const before = '<h3>Plan</h3><p>My notes</p><div class="desk-embed" data-item="a" contenteditable="false"></div><p><br></p>';
    const after = withDraft(before, blocks, '17 Oct 2026');
    expect(after.startsWith('<h3>Plan</h3><p>My notes</p><div class="desk-embed" data-item="a" contenteditable="false"></div><h3>Draft — 17 Oct 2026</h3><h3>Claim')).toBe(true);
    expect(after.endsWith('<p>Line one<br>line two</p><p><br></p>')).toBe(true);
  });
});
