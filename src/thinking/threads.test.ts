import { describe, expect, it } from 'vitest';
import type { Desk, DeskItem } from '../studyDesk/types';
import { byBook, filterThreads, growth, joinsActiveThread, namesFromTyped, threadChoices, threadLabel, threadMembers, threadSummaries } from './threads';

const desk = (id: string, extra: Partial<Desk> = {}): Desk => ({ id, kind: 'thread', title: id, html: '', createdAt: 1, updatedAt: 1, ...extra });
const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'book:b1', type: 'quote', text: id, inInbox: true, createdAt: 1, updatedAt: 1, ...extra });

describe('threads', () => {
  it('labels a thread by its Arabic and English names', () => {
    expect(threadLabel({ title: 'Everything on intention', titleAr: 'النية' })).toBe('النية · Everything on intention');
    expect(threadLabel({ title: 'النية', titleAr: 'النية' })).toBe('النية');
    expect(threadLabel({ title: 'Intention' })).toBe('Intention');
    expect(namesFromTyped(' النية ', true)).toEqual({ title: 'النية', titleAr: 'النية' });
    expect(namesFromTyped('Intention', false)).toEqual({ title: 'Intention' });
  });

  it('counts members, books and the last addition, most recent thread first', () => {
    const items = [
      item('a', { threads: ['t1'], joined: { t1: 50 }, source: { bookId: 'b1' } }),
      item('b', { threads: ['t1', 't2'], joined: { t1: 10, t2: 90 }, source: { bookId: 'b2' } }),
      item('c', { threads: ['t1'], joined: { t1: 70 }, droppedAt: 80 }),
    ];
    const list = threadSummaries([desk('t1'), desk('t2'), { ...desk('own'), kind: 'own' }], items);
    expect(list.map((s) => [s.desk.id, s.count, s.books, s.lastAdded])).toEqual([
      ['t2', 1, 1, 90],
      ['t1', 2, 2, 50],
    ]);
    expect(threadMembers('t1', items).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('filters by name or question, words in any order', () => {
    const list = threadSummaries([desk('t1', { title: 'Intention', titleAr: 'النية', question: 'Name it or aim it?' }), desk('t2', { title: 'Sincerity' })], []);
    expect(filterThreads(list, 'aim name').map((s) => s.desk.id)).toEqual(['t1']);
    expect(filterThreads(list, 'النية').map((s) => s.desk.id)).toEqual(['t1']);
    expect(filterThreads(list, '').length).toBe(2);
  });

  it('offers the active thread first, then the recent ones, then any the passage is already in', () => {
    const list = threadSummaries(['a', 'b', 'c', 'd', 'e'].map((id, i) => desk(id, { createdAt: 10 - i })), []);
    const ids = (active: string | null, threads?: string[]) => threadChoices(list, active, item('p', { threads })).map((s) => s.desk.id);
    expect(ids(null)).toEqual(['a', 'b', 'c']);
    expect(ids('d')).toEqual(['d', 'a', 'b', 'c']);
    expect(ids(null, ['e'])).toEqual(['a', 'b', 'c', 'e']);
  });

  it('grows month by month', () => {
    const now = new Date(2026, 9, 12).getTime();
    const dates = [new Date(2025, 9, 20).getTime(), new Date(2026, 2, 4).getTime(), new Date(2026, 2, 5).getTime(), new Date(2026, 9, 1).getTime()];
    const g = growth(dates, now);
    expect(g).toHaveLength(13);
    expect(g[0]).toBe(1);
    expect(g[5]).toBe(3);
    expect(g[12]).toBe(4);
  });

  it('groups members by book, your own last', () => {
    const groups = byBook([item('a', { source: { bookId: 'b2', bookTitle: 'Iḥyāʾ' } }), item('n', { type: 'note' }), item('b', { source: { bookId: 'b1', bookTitle: 'Jāmiʿ' } }), item('c', { source: { bookId: 'b2', bookTitle: 'Iḥyāʾ' } })]);
    expect(groups.map((g) => [g.bookTitle, g.items.map((i) => i.id)])).toEqual([
      ['Iḥyāʾ', ['a', 'c']],
      ['Jāmiʿ', ['b']],
      ['Your own', ['n']],
    ]);
  });

  it('joins thoughts, masāʾil and moves to the active thread, not plain captures', () => {
    expect(joinsActiveThread(item('n', { type: 'line' }))).toBe(true);
    expect(joinsActiveThread(item('q', { type: 'question' }))).toBe(true);
    expect(joinsActiveThread(item('m', { move: 'claim' }))).toBe(true);
    expect(joinsActiveThread(item('c', { type: 'capture' }))).toBe(false);
  });
});
