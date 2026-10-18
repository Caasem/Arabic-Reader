import { describe, expect, it } from 'vitest';
import type { DeskItem } from '../studyDesk/types';
import { ago, citeOf, isPassage, isThought, onPassage, overlaps, readingOrder, short } from './passages';

const item = (extra: Partial<DeskItem>): DeskItem => ({ id: 'x', deskId: 'd', type: 'quote', text: 'نص', inInbox: true, createdAt: 1, updatedAt: 1, ...extra });

describe('passages', () => {
  it('knows a passage by its place: a box on a PDF page or a stretch of text', () => {
    expect(isPassage(item({ source: { bookId: 'b', location: 'pdf:3:0.1:0.2:0.5:0.04' } }))).toBe(true);
    expect(isPassage(item({ source: { bookId: 'b', location: 'pdf:3:0:0.2:1:0' } }))).toBe(false);
    expect(isPassage(item({ source: { bookId: 'b', location: 'clean:2:10:40' } }))).toBe(true);
    expect(isPassage(item({ source: { bookId: 'b', location: 'clean:2:10:10' } }))).toBe(false);
    expect(isPassage(item({ type: 'note', source: { bookId: 'b', location: 'clean:2:10:40' } }))).toBe(false);
  });

  it('knows a thought by its words, and not once it is dropped', () => {
    expect(isThought(item({ type: 'line', text: '', body: 'Two jobs' }))).toBe(true);
    expect(isThought(item({ type: 'line', text: '', body: '  ' }))).toBe(false);
    expect(isThought(item({ type: 'note', text: '', body: 'x', droppedAt: 5 }))).toBe(false);
  });

  it('meets places on the same page or in the same chapter', () => {
    expect(overlaps('pdf:3:0.1:0.20:0.5:0.04', 'pdf:3:0.1:0.22:0.3:0.04')).toBe(true);
    expect(overlaps('pdf:3:0.1:0.20:0.5:0.04', 'pdf:3:0:0.21:1:0')).toBe(true);
    expect(overlaps('pdf:3:0.1:0.20:0.5:0.04', 'pdf:3:0:0.40:1:0')).toBe(false);
    expect(overlaps('pdf:3:0.1:0.20:0.5:0.04', 'pdf:4:0.1:0.20:0.5:0.04')).toBe(false);
    expect(overlaps('clean:2:10:40', 'clean:2:40:40')).toBe(true);
    expect(overlaps('clean:2:10:40', 'clean:2:41:50')).toBe(false);
    expect(overlaps('clean:2:10:40', 'clean:3:10:40')).toBe(false);
    expect(overlaps('clean:2:10:40', 'pdf:2:0:0:1:1')).toBe(false);
  });

  it('puts a note on a passage when they meet in the same book', () => {
    const passage = item({ source: { bookId: 'b', location: 'clean:2:10:40' } });
    expect(onPassage(item({ type: 'line', pin: { bookId: 'b', location: 'clean:2:12:12', side: 'left' } }), passage)).toBe(true);
    expect(onPassage(item({ type: 'line', pin: { bookId: 'c', location: 'clean:2:12:12', side: 'left' } }), passage)).toBe(false);
  });

  it('cites, sorts and shortens', () => {
    expect(citeOf(item({ source: { bookId: 'b', bookTitle: 'Jāmiʿ', location: 'pdf:62:0:0:1:1' } }))).toBe('Jāmiʿ, p. 62');
    expect(citeOf(item({ source: { bookId: 'b', bookTitle: 'Jāmiʿ', location: 'clean:2:1:5', chapterLabel: 'Hadith 1' } }))).toBe('Jāmiʿ, Hadith 1');
    const a = item({ source: { bookId: 'b', location: 'pdf:2:0:0.5:1:0.1' } });
    const b = item({ source: { bookId: 'b', location: 'pdf:2:0:0.1:1:0.1' } });
    expect([a, b].sort(readingOrder)).toEqual([b, a]);
    expect(short('one two three four five', 12)).toBe('one two…');
    const now = new Date(2026, 9, 12, 12).getTime();
    expect(ago(now, now)).toBe('today');
    expect(ago(now - 3 * 864e5, now)).toBe('3 days ago');
    expect(ago(now - 366 * 864e5, now)).toBe('a year ago');
  });
});
