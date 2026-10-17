import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { answerPatch, isOpen, masail, oldestOpen, reopenPatch, waited } from './masail';

const item = (id: string, extra: Partial<DeskItem> = {}): DeskItem => ({ id, deskId: 'd', type: 'question', text: id, inInbox: true, createdAt: 1, updatedAt: 1, ...extra });
const mapOf = (items: DeskItem[]) => new Map(items.map((i) => [i.id, i]));

describe('masail', () => {
  const passage = item('p', { type: 'quote' });
  const oldQ = item('old', { createdAt: 10 });
  const newQ = item('new', { createdAt: 20 });
  const ansEarly = item('ans1', { createdAt: 5, answer: 'p', answeredAt: 100 });
  const ansLate = item('ans2', { createdAt: 6, answer: 'p', answeredAt: 200 });
  const orphan = item('orphan', { createdAt: 15, answer: 'gone', answeredAt: 300 });
  const all = [newQ, passage, ansEarly, oldQ, ansLate, orphan];
  const byId = mapOf(all);

  it('is open without an answer, or when the answering passage is gone', () => {
    expect(isOpen(oldQ, byId)).toBe(true);
    expect(isOpen(orphan, byId)).toBe(true);
    expect(isOpen(ansEarly, byId)).toBe(false);
  });

  it('lists questions only: open oldest first, answered most recently answered first', () => {
    expect(masail(all, byId, 'open').map((q) => q.id)).toEqual(['old', 'orphan', 'new']);
    expect(masail(all, byId, 'answered').map((q) => q.id)).toEqual(['ans2', 'ans1']);
    expect(masail(all, byId, 'all').map((q) => q.id)).toEqual(['old', 'orphan', 'new', 'ans2', 'ans1']);
  });

  it('finds the oldest open one', () => {
    expect(oldestOpen(all, byId)?.id).toBe('old');
    expect(oldestOpen([ansEarly, passage], mapOf([ansEarly, passage]))).toBeNull();
  });

  it('says how long it has waited', () => {
    const now = new Date(2026, 9, 12, 12).getTime();
    expect(waited(now, now)).toBe('less than a day');
    expect(waited(now - 864e5, now)).toBe('a day');
    expect(waited(now - 3 * 864e5, now)).toBe('3 days');
    expect(waited(now - 61 * 864e5, now)).toBe('2 months');
    expect(waited(now - 366 * 864e5, now)).toBe('a year');
    expect(waited(now - 800 * 864e5, now)).toBe('2 years');
  });

  it('sets and clears the answer', () => {
    expect(answerPatch('p', 5)).toEqual({ answer: 'p', answeredAt: 5 });
    const re = reopenPatch();
    expect(re).toEqual({ answer: undefined, answeredAt: undefined });
    expect(Object.keys(re)).toEqual(['answer', 'answeredAt']);
  });
});
