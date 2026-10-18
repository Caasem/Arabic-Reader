import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { agree, drop, droppedThoughts, dueThoughts, firstReview, history, intervalLabel, nextDue, passageFor, restore, revise } from './revisit';

const DAY = 864e5;
const T0 = Date.UTC(2026, 0, 1);

const thought = (extra: Partial<DeskItem> = {}): DeskItem => ({
  id: 't',
  deskId: 'd',
  type: 'line',
  text: '',
  body: 'Intention decides the deed',
  inInbox: false,
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

describe('revisit scheduling', () => {
  it('sets the first visit a week out', () => {
    expect(firstReview(T0)).toEqual({ due: T0 + 7 * DAY, every: 7, agreed: [] });
  });

  it('moves further out each time the reader still agrees, and remembers when', () => {
    let review = firstReview(T0);
    let now = review.due;
    const gaps: number[] = [];
    for (let n = 1; n <= 4; n++) {
      const before = review;
      review = agree(review, now);
      expect(review.due).toBeGreaterThan(before.due);
      expect(review.every).toBeGreaterThan(before.every);
      expect(review.due).toBe(now + review.every * DAY);
      expect(review.agreed).toHaveLength(n);
      expect(review.agreed[n - 1]).toBe(now);
      expect(review.card?.reps).toBeGreaterThan(0);
      gaps.push(review.every);
      now = review.due;
    }
    expect(gaps[3]).toBeGreaterThan(gaps[0]);
  });

  it('still moves out when the reader agrees before it is due', () => {
    const first = firstReview(T0);
    const again = agree(agree(first, T0 + DAY), T0 + 2 * DAY);
    expect(again.every).toBeGreaterThan(first.every);
  });

  it('keeps the old wording when revising, and writes the new one in the body of a line or note', () => {
    const item = thought({ review: firstReview(T0) });
    const now = T0 + 8 * DAY;
    const patch = revise(item, '  Intention shapes the deed  ', now);
    expect(patch.versions).toEqual([{ at: T0, text: 'Intention decides the deed' }]);
    expect(patch.body).toBe('Intention shapes the deed');
    expect(patch).not.toHaveProperty('text');
    expect(patch.review?.due).toBeGreaterThan(now);
    expect(patch.review?.card?.lastReview).toBe(now);
  });

  it('writes the new wording in text when the words live there', () => {
    const patch = revise(thought({ type: 'note', text: 'A claim', body: undefined, review: firstReview(T0) }), 'A better claim', T0 + 8 * DAY);
    expect(patch.text).toBe('A better claim');
    expect(patch).not.toHaveProperty('body');
    expect(patch.versions?.[0].text).toBe('A claim');
  });

  it('dates each version by when that wording was written', () => {
    let item = thought({ review: firstReview(T0) });
    const first = T0 + 8 * DAY;
    item = { ...item, ...revise(item, 'Second', first) };
    const second = first + 3 * DAY;
    item = { ...item, ...revise(item, 'Third', second) };
    expect(item.versions).toEqual([
      { at: T0, text: 'Intention decides the deed' },
      { at: first, text: 'Second' },
    ]);
    expect(history(item).map((h) => [h.text, h.current])).toEqual([
      ['Third', true],
      ['Second', false],
      ['Intention decides the deed', false],
    ]);
    expect(history(item)[0].at).toBe(second);
  });

  it('revises a thought that has no review yet', () => {
    const patch = revise(thought(), 'New', T0 + DAY);
    expect(patch.review?.due).toBeGreaterThan(T0 + DAY);
  });

  it('drops with a date, and an undo patch can clear it', () => {
    expect(drop(T0)).toEqual({ droppedAt: T0 });
  });

  it('lists live, due thoughts, longest waiting first, and finds the next visit', () => {
    const now = T0 + 10 * DAY;
    const late = thought({ id: 'late', review: { due: now - 5 * DAY, every: 7, agreed: [] } });
    const today = thought({ id: 'today', review: { due: now - DAY, every: 7, agreed: [] } });
    const dropped = thought({ id: 'dropped', droppedAt: now, review: { due: now - 9 * DAY, every: 7, agreed: [] } });
    const future = thought({ id: 'future', review: { due: now + 3 * DAY, every: 7, agreed: [] } });
    const later = thought({ id: 'later', review: { due: now + 9 * DAY, every: 7, agreed: [] } });
    const plain = thought({ id: 'plain' });
    const passage = thought({ id: 'passage', type: 'quote', text: 'نص', body: undefined, review: { due: now - DAY, every: 7, agreed: [] } });
    const items = [today, later, dropped, future, late, plain, passage];
    expect(dueThoughts(items, now).map((i) => i.id)).toEqual(['late', 'today']);
    expect(nextDue(items, now)).toBe(now + 3 * DAY);
    expect(nextDue([dropped, plain], now)).toBeNull();
  });

  it('says how far off a visit is', () => {
    expect(intervalLabel(1)).toBe('a day');
    expect(intervalLabel(18)).toBe('18 days');
    expect(intervalLabel(95)).toBe('3 months');
    expect(intervalLabel(900)).toBe('2 years');
  });

  it('finds the passage a thought is on', () => {
    const passage = { ...thought({ id: 'p', type: 'quote', text: 'نص', body: undefined }), source: { bookId: 'b', location: 'clean:2:10:40' } };
    const on = thought({ pin: { bookId: 'b', location: 'clean:2:12:12', side: 'left' } });
    const elsewhere = thought({ pin: { bookId: 'b', location: 'clean:5:12:12', side: 'left' } });
    expect(passageFor(on, [on, passage])?.id).toBe('p');
    expect(passageFor(elsewhere, [elsewhere, passage])).toBeUndefined();
  });
});

describe('version dates', () => {
  it('dates each kept wording by when it was written, across a Still agree in between', () => {
    const t1 = T0 + 10 * DAY;
    const t2 = T0 + 40 * DAY;
    const t3 = T0 + 90 * DAY;
    let item = thought({ review: firstReview(T0) });
    item = { ...item, ...revise(item, 'Second wording', t1) } as DeskItem;
    item = { ...item, review: agree(item.review!, t2) };
    item = { ...item, ...revise(item, 'Third wording', t3) } as DeskItem;
    expect(item.versions).toEqual([
      { at: T0, text: 'Intention decides the deed' },
      { at: t1, text: 'Second wording' },
    ]);
    expect(history(item).map((h) => [h.at, h.text, h.current])).toEqual([
      [t3, 'Third wording', true],
      [t1, 'Second wording', false],
      [T0, 'Intention decides the deed', false],
    ]);
  });
});

describe('dropped thoughts', () => {
  it('lists the dropped thoughts, the latest drop first, leaving out live ones and other kinds', () => {
    const items = [
      thought({ id: 'a', droppedAt: T0 + 5 }),
      thought({ id: 'b', droppedAt: T0 + 9 }),
      thought({ id: 'live' }),
      thought({ id: 'q', type: 'question', text: 'Why?', body: undefined, droppedAt: T0 + 7 }),
      thought({ id: 'empty', body: '', droppedAt: T0 + 8 }),
    ];
    expect(droppedThoughts(items).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('restores a thought into a fresh first visit a week out, and drops it from the dropped list', () => {
    const dropped = thought({ droppedAt: T0 + 3, review: { due: T0 - DAY, every: 30, agreed: [T0] } });
    const patch = restore(T0 + 10 * DAY);
    expect(patch).toEqual({ droppedAt: undefined, review: firstReview(T0 + 10 * DAY) });
    const back = { ...dropped, ...patch };
    expect(droppedThoughts([back])).toEqual([]);
    expect(dueThoughts([back], T0 + 18 * DAY).map((i) => i.id)).toEqual(['t']);
    expect(dueThoughts([back], T0 + 12 * DAY)).toEqual([]);
  });
});
