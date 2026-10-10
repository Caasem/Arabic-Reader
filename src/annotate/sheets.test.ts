import { describe, expect, it } from 'vitest';
import { covers, nextTitle, rangeScope, scopeLabel, searchSheets, sheetName, tabsAt } from './sheets';
import type { Sketch } from './types';

const sheet = (id: string, key: string, location: string, extra: Partial<Sketch> = {}): Sketch => ({
  id,
  bookId: 'b',
  key,
  location,
  mode: 'draw',
  view: { tx: 0, ty: 0, s: 1 },
  strokes: [],
  nodes: [],
  edges: [],
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  updatedAt: 1,
  ...extra,
});

describe('sheets at a place', () => {
  const p3 = { kind: 'pdf' as const, page: 3 };
  it('gives every sheet of a page, ranges that cover it and book sheets, leaving closed ones out', () => {
    const all = [
      sheet('s1', 'pdf:3', 'pdf:3'),
      sheet('s2', 'pdf:3', 'pdf:3', { hidden: true }),
      sheet('s3', 'pdf:4', 'pdf:4'),
      sheet('s4', 'pdf:2', 'pdf:2', { scope: { kind: 'range', from: 2, to: 5 } }),
      sheet('s5', 'pdf:9', 'pdf:9', { scope: { kind: 'book' } }),
      sheet('s6', 'clean:0', 'clean:0:0:10', { scope: { kind: 'book' } }),
    ];
    expect(tabsAt(all, p3).map((s) => s.id)).toEqual(['s1', 's4', 's5']);
  });

  it('keeps reader sheets with the passage they were started on', () => {
    const s = sheet('s1', 'clean:2', 'clean:2:100:400');
    expect(covers(s, { kind: 'clean', chapter: 2, start: 50, end: 300 })).toBe(true);
    expect(covers(s, { kind: 'clean', chapter: 2, start: 350, end: 700 })).toBe(true);
    expect(covers(s, { kind: 'clean', chapter: 2, start: 500, end: 900 })).toBe(false);
    expect(covers(s, { kind: 'clean', chapter: 3, start: 0, end: 900 })).toBe(false);
  });

  it('names sheets "Sheet n" until renamed, and picks the next free number', () => {
    expect(sheetName({}, 0)).toBe('Sheet 1');
    expect(sheetName({ title: ' Grammar ' }, 0)).toBe('Grammar');
    expect(nextTitle([{}, { title: 'Sheet 3' }])).toBe('Sheet 4');
    expect(nextTitle([{ title: 'Grammar' }])).toBe('Sheet 2');
  });

  it('describes scopes, and a range always keeps the sheet\'s own page', () => {
    expect(scopeLabel(sheet('s', 'pdf:3', 'pdf:3'))).toBe('Page 3');
    expect(scopeLabel(sheet('s', 'clean:0', 'clean:0:0:1', { scope: { kind: 'range', from: 0, to: 2 } }))).toBe('Chapters 1–3');
    expect(rangeScope(sheet('s', 'pdf:3', 'pdf:3'), 5, 8)).toEqual({ kind: 'range', from: 3, to: 8 });
  });
});

describe('searching sheets', () => {
  it('matches names and the words on a sheet, Arabic without its vowels', () => {
    const node = (text: string) => ({ id: text, x: 0, y: 0, w: 100, h: 40, text, kind: 'plain' as const });
    const all = [sheet('s1', 'pdf:1', 'pdf:1', { title: 'Grammar' }), sheet('s2', 'pdf:2', 'pdf:2', { nodes: [node('عَصَبِيَّة')] })];
    expect(searchSheets(all, 'gram').map((r) => r.sketch.id)).toEqual(['s1']);
    const hit = searchSheets(all, 'عصبية');
    expect(hit.map((r) => r.sketch.id)).toEqual(['s2']);
    expect(hit[0].snippet).toBe('عَصَبِيَّة');
    expect(searchSheets(all, '')).toHaveLength(2);
  });
});

