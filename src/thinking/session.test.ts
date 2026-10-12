// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta } from '../types';
import { clearEnded, countMove, endedSession, endVisit, resetSessionForTests, startVisit } from './session';

const book = (id: string): BookMeta => ({ id, title: `Book ${id}` }) as BookMeta;
const MIN = 60_000;

describe('reading session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSessionForTests();
  });
  afterEach(() => {
    resetSessionForTests();
    vi.useRealTimers();
  });

  /** Reading: an input every minute, so the reader never counts as idle. */
  const read = (minutes: number) => {
    for (let i = 0; i < minutes; i++) {
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(MIN);
    }
  };

  it('counts minutes of active reading and publishes them when the reader closes', () => {
    startVisit(book('a'));
    read(6);
    countMove();
    endVisit();
    expect(endedSession()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(endedSession()).toMatchObject({ bookId: 'a', bookTitle: 'Book a', minutes: 6, pages: 0, made: { moves: 1, thoughts: 0, questions: 0, threaded: 0 } });
  });

  it('does not count minutes with no input', () => {
    startVisit(book('a'));
    vi.advanceTimersByTime(10 * MIN);
    endVisit();
    vi.advanceTimersByTime(2000);
    // Two minutes of grace after the open, then idle.
    expect(endedSession()?.minutes).toBeLessThanOrEqual(2);
  });

  it('keeps a quick unmount and mount (a book switch) as one visit, journalled under the last book', () => {
    startVisit(book('a'));
    read(3);
    endVisit();
    startVisit(book('b'));
    read(3);
    endVisit();
    vi.advanceTimersByTime(2000);
    expect(endedSession()).toMatchObject({ bookId: 'b', minutes: 6 });
  });

  it('clears a waiting session when the reader opens a book again', () => {
    startVisit(book('a'));
    read(5);
    endVisit();
    vi.advanceTimersByTime(2000);
    expect(endedSession()).not.toBeNull();
    startVisit(book('b'));
    expect(endedSession()).toBeNull();
    clearEnded();
  });
});
