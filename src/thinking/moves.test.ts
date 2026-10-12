import { describe, expect, it } from 'vitest';
import type { DeskItem, DeskLink } from '../studyDesk/types';
import { buildArgument } from './argument';
import { canTie, moveForKey, movePatch, tieCandidates, tieKind, tieOf, tieQuestion } from './moves';

const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'd', type: 'quote', text: id, inInbox: true, createdAt: 1, updatedAt: 1, ...extra });
const map = (items: DeskItem[]) => new Map(items.map((i) => [i.id, i]));

describe('moves and ties', () => {
  it('maps keys 1–5 to the moves', () => {
    expect(['1', '2', '3', '4', '5', '6'].map(moveForKey)).toEqual(['definition', 'claim', 'evidence', 'objection', 'reply', null]);
  });

  it('ties evidence and objections to claims, replies to objections', () => {
    expect(tieKind('evidence')).toBe('claim');
    expect(tieKind('objection')).toBe('claim');
    expect(tieKind('reply')).toBe('objection');
    expect(tieKind('definition')).toBeNull();
    expect(tieKind('claim')).toBeNull();
    expect(tieQuestion('reply')).toBe('Which objection does it answer?');
  });

  it('takes a move off when chosen again, and drops the tie when it changes', () => {
    expect(movePatch(item('a', { move: 'claim' }), 'claim')).toEqual({ move: undefined, tie: undefined });
    expect(movePatch(item('a', { move: 'evidence', tie: 'c' }), 'objection')).toEqual({ move: 'objection', tie: undefined });
  });

  it('reads a tie only while it is the right kind', () => {
    const claim = item('c', { move: 'claim' });
    const ev = item('e', { move: 'evidence', tie: 'c' });
    expect(canTie(ev, claim)).toBe(true);
    expect(tieOf(ev, map([claim, ev]))).toBe(claim);
    expect(tieOf(ev, map([{ ...claim, move: 'definition' }, ev]))).toBeNull();
    expect(tieOf(ev, map([ev]))).toBeNull();
    expect(canTie(item('r', { move: 'reply' }), claim)).toBe(false);
  });

  it('offers the active thread first, then this book, then the rest, newest first', () => {
    const c1 = item('c1', { move: 'claim', createdAt: 3 });
    const c2 = item('c2', { move: 'claim', createdAt: 2, source: { bookId: 'b' } });
    const c3 = item('c3', { move: 'claim', createdAt: 1, threads: ['t'] });
    const o = item('o', { move: 'objection' });
    const me = item('me');
    expect(tieCandidates(me, 'evidence', [c1, c2, c3, o, me], { thread: 't', bookId: 'b' }).map((i) => i.id)).toEqual(['c3', 'c2', 'c1']);
    expect(tieCandidates(me, 'reply', [c1, o]).map((i) => i.id)).toEqual(['o']);
    expect(tieCandidates(me, 'definition', [c1, o])).toEqual([]);
  });
});

describe('the argument tree', () => {
  it('builds definitions, claims with evidence and objections, replies under objections, and what is loose', () => {
    const d1 = item('d1', { move: 'definition' });
    const d2 = item('d2', { move: 'definition' });
    const c = item('c', { move: 'claim', source: { bookId: 'b', location: 'pdf:62:0.1:0.5:0.8:0.1' } });
    const e = item('e', { move: 'evidence', tie: 'c' });
    const o = item('o', { move: 'objection', tie: 'c' });
    const r = item('r', { move: 'reply', tie: 'o' });
    const loose = item('l', { move: 'evidence' });
    const outside = item('x', { move: 'evidence', tie: 'elsewhere' });
    const q1 = item('q1', { type: 'question', text: 'Why?', source: { bookId: 'b', location: 'pdf:62:0:0.55:1:0' } });
    const q2 = item('q2', { type: 'question', text: 'And?' });
    const done = item('q3', { type: 'question', answer: 'c' });
    const links: DeskLink[] = [{ id: 'l1', a: 'd1', b: 'd2', rel: 'differs', note: '', createdAt: 1, updatedAt: 1 }];
    const members = [r, d1, o, c, e, d2, loose, outside, q1, q2, done];
    const arg = buildArgument(members, map(members), links, (q) => !q.answer);
    expect(arg.definitions.map((n) => n.item.id)).toEqual(['d1', 'd2']);
    expect(arg.tensions.map((t) => [t.a.id, t.b.id])).toEqual([['d1', 'd2']]);
    expect(arg.claims).toHaveLength(1);
    const claim = arg.claims[0];
    expect(claim.kids.map((k) => k.item.id)).toEqual(['o', 'e']);
    expect(claim.kids[0].kids.map((k) => k.item.id)).toEqual(['r']);
    expect(claim.questions.map((q) => q.id)).toEqual(['q1']);
    expect(arg.loose.map((n) => n.item.id).sort()).toEqual(['l', 'x']);
    expect(arg.questions.map((q) => q.id)).toEqual(['q2']);
  });

  it('puts a reply whose objection is loose under that objection', () => {
    const o = item('o', { move: 'objection' });
    const r = item('r', { move: 'reply', tie: 'o' });
    const arg = buildArgument([r, o], map([r, o]), [], () => true);
    expect(arg.loose.map((n) => [n.item.id, n.kids.map((k) => k.item.id)])).toEqual([['o', ['r']]]);
  });
});

describe('a thought on a passage', () => {
  it('sits level with the passage start, as a Ḥāshiya note', async () => {
    const { newThought, thoughtPlace } = await import('./thoughts');
    const book = { id: 'b', title: 'Jāmiʿ' } as never;
    const pdf = item('p', { source: { bookId: 'b', location: 'pdf:62:0.1000:0.3000:0.5000:0.0500', chapterLabel: 'Page 62' } });
    expect(thoughtPlace(pdf)).toBe('pdf:62:0.0000:0.3000:1.0000:0.0000');
    expect(thoughtPlace(item('c', { source: { bookId: 'b', location: 'clean:4:10:60' } }))).toBe('clean:4:10:10');
    const t = newThought(pdf, book, ' Two jobs ', { claim: true, links: ['t1'] });
    expect(t).toMatchObject({ type: 'note', body: 'Two jobs', move: 'claim', links: ['t1'], fromMargin: true, pin: { bookId: 'b', side: 'right' } });
    expect(t.source?.location).toBe(t.pin?.location);
  });
});
